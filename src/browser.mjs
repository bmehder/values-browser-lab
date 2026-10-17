// Ordinary JavaScript at the browser boundary. Application decisions stay in Gleam.
import * as v from 'valibot'
import { cond, ifElse, map, pipe, T, tryCatch } from 'ramda'
import { Story, StoryTitle, StoryUrl } from './model.mjs'
import { toList } from '../gleam_stdlib/gleam.mjs'

const storageKey = 'values-browser-lab:draft'

export const now = () =>
	new Date().toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})

const discussionUrl = hit =>
	`https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`

// Both malformed URLs and non-web protocols use the discussion page.
const storyUrl = tryCatch(
	hit => ifElse(
		url => url.protocol === 'https:' || url.protocol === 'http:',
		url => url.href,
		() => discussionUrl(hit),
	)(new URL(hit.url)),
	(_error, hit) => discussionUrl(hit),
)

const toStories = pipe(
	map(hit => new Story(new StoryTitle(hit.title), new StoryUrl(storyUrl(hit)))),
	toList,
)

// The schema describes which external values are safe to convert to Gleam.
const SearchResponse = v.object({
	hits: v.array(
		v.object({
			title: v.string(),
			objectID: v.string(),
			url: v.optional(v.nullable(v.string())),
		}),
	),
})

// Validate the JSON, then construct actual Gleam values.
export const decodeStories = pipe(
	body => v.parse(SearchResponse, body),
	response => response.hits,
	toStories,
)

const searchFailure = cond([
	[error => error?.name === 'AbortError', () => 'The request timed out. Try again.'],
	[error => error instanceof v.ValiError, () => 'The service returned an unexpected response.'],
	[error => typeof error?.message === 'string', error => error.message],
	[T, () => 'The service could not be reached.'],
])

const searchUrl = query =>
	`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&query=${encodeURIComponent(query)}`

const readSearchResponse = ifElse(
	response => response.ok,
	response => response.json(),
	response => Promise.reject(new Error(`Service returned HTTP ${response.status}.`)),
)

// The default timeout is created separately for every request.
const fetchStories = (
	query,
	controller,
	timeout = setTimeout(() => controller.abort(), 12000),
) =>
	Promise.resolve()
		.then(() => fetch(searchUrl(query), { signal: controller.signal }))
		.then(readSearchResponse)
		.then(decodeStories)
		.finally(() => clearTimeout(timeout))

// Sibling handlers: a bug in success cannot trigger the failure callback.
export const search = (query, success, failure) =>
	fetchStories(query, new AbortController()).then(
		success,
		pipe(searchFailure, failure),
	)

// Catch only the storage operation, never the application's callbacks.
const writeDraft = tryCatch(
	pipe(text => localStorage.setItem(storageKey, text), () => true),
	() => false,
)

export const save = (text, success, failure) =>
	ifElse(
		writeDraft,
		() => success(),
		() => failure('This browser could not save the query.'),
	)(text)

const readDraft = tryCatch(
	pipe(() => localStorage.getItem(storageKey), text => ({ ok: true, text })),
	() => ({ ok: false }),
)

export const restore = (success, failure) =>
	pipe(
		readDraft,
		cond([
			[result => !result.ok, () => failure('This browser could not read saved queries.')],
			[result => result.text === null, () => failure('No saved query yet.')],
			[T, result => success(result.text)],
		]),
	)()

const writeClipboard = text => ifElse(
	clipboard => typeof clipboard?.writeText === 'function',
	clipboard => Promise.resolve()
		.then(() => clipboard.writeText(text))
		.catch(() => Promise.reject(new Error('Clipboard access was denied.'))),
	() => Promise.reject(new Error('Clipboard access is unavailable in this browser.')),
)

export const copy = (text, success, failure) =>
	Promise.resolve()
		.then(() => globalThis.navigator?.clipboard)
		.then(writeClipboard(text), () => Promise.reject(new Error('Clipboard access was denied.')))
		.then(success, error => failure(error.message))

export const delay = (milliseconds, finished) =>
	setTimeout(finished, milliseconds)
