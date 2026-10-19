// Browser effects. Application decisions stay in Gleam.
import * as v from 'valibot'
import {
	always,
	andThen,
	cond,
	equals,
	has,
	ifElse,
	includes,
	map,
	pipe,
	prop,
	T,
	tryCatch,
} from 'ramda'
import { Story, StoryTitle, StoryUrl } from './model.mjs'
import { toList } from '../../gleam_stdlib/gleam.mjs'

const storageKey = 'values-browser-lab:draft'
const searchTimeoutMilliseconds = 12000
const SearchResponse = v.object({
	hits: v.array(
		v.object({
			title: v.string(),
			objectID: v.string(),
			url: v.optional(v.nullable(v.string())),
		}),
	),
})

const discussionUrl = hit =>
	`https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`

// Invalid, missing, and non-HTTP URLs all fall back to the story's discussion.
const storyUrl = hit =>
	tryCatch(
		pipe(
			prop('url'),
			value => new URL(value),
			ifElse(
				url => includes(url.protocol, ['http:', 'https:']),
				prop('href'),
				() => discussionUrl(hit),
			),
		),
		() => discussionUrl(hit),
	)(hit)

const toStory = hit => {
	const title = new StoryTitle(hit.title)
	const url = new StoryUrl(storyUrl(hit))
	return new Story(title, url)
}

// const _toStory = converge(construct(Story), [
// 	pipe(prop('title'), construct(StoryTitle)),
// 	pipe(storyUrl, construct(StoryUrl)),
// ])

export const decodeStories = pipe(
	body => v.parse(SearchResponse, body),
	prop('hits'),
	map(toStory),
	toList,
)

const searchFailure = cond([
	[
		error => error?.name === 'AbortError',
		always('The request timed out. Try again.'),
	],
	[
		error => error instanceof v.ValiError,
		always('The service returned an unexpected response.'),
	],
	[T, error => error?.message ?? 'The service could not be reached.'],
])

const searchUrl = query =>
	`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&query=${encodeURIComponent(query)}`

const readResponse = ifElse(
	prop('ok'),
	response => response.json(),
	response => Promise.reject(new Error(`Service returned HTTP ${response.status}.`)),
)

function fetchStories(query) {
	// Each request owns its abort controller and deadline, including JSON parsing.
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), searchTimeoutMilliseconds)

	return pipe(
		url => Promise.resolve(url),
		andThen(url => fetch(url, { signal: controller.signal })),
		andThen(readResponse),
		andThen(decodeStories),
	)(searchUrl(query)).finally(() => clearTimeout(timeout))
}

// Sibling handlers keep callback bugs separate from failed browser operations.
export const search = (query, success, failure) =>
	fetchStories(query).then(success, pipe(searchFailure, failure))

// Only the browser operation is caught; application callbacks run afterward.
const writeSavedQuery = tryCatch(
	text => {
		localStorage.setItem(storageKey, text)
		return {}
	},
	() => ({ error: 'This browser could not save the query.' }),
)

export const save = (text, success, failure) =>
	pipe(
		writeSavedQuery,
		ifElse(
			has('error'),
			({ error }) => failure(error),
			() => success(),
		),
	)(text)

const readSavedQuery = tryCatch(
	() => ({ text: localStorage.getItem(storageKey) }),
	() => ({ error: 'This browser could not read saved queries.' }),
)

export const restore = (success, failure) =>
	pipe(
		readSavedQuery,
		ifElse(
			has('error'),
			({ error }) => failure(error),
			({ text }) =>
				ifElse(equals(null), () => failure('No saved query yet.'), success)(text),
		),
	)()
