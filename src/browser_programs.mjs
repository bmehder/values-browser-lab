import {
	T,
	cond,
	flow,
	identity,
	ifElse,
	is,
	isNil,
	map,
	pipe,
	prop,
	propEq,
	tryCatch,
} from 'ramda'
import * as v from 'valibot'
import {
	andThen,
	fail,
	map as mapTask,
	mapError,
	succeed,
	task,
	using,
} from './task.mjs'

const storageKey = 'values-browser-lab:draft'

// Schemas are values too. Only validated response data reaches the domain.
const SearchResponse = v.object({
	hits: v.array(
		v.object({
			title: v.string(),
			objectID: v.string(),
			url: v.optional(v.nullable(v.string())),
		}),
	),
})

export const decodeSearchResponse = pipe(
	input => v.safeParse(SearchResponse, input),
	ifElse(prop('success'), pipe(prop('output'), prop('hits'), succeed), () =>
		fail('The service returned an unexpected response.'),
	),
)

const discussionUrl = hit =>
	`https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`

// These outcomes describe whether a URL can become a browser link.
const UsableUrl = href => Object.freeze({ kind: 'UsableUrl', href })
const UnusableUrl = Object.freeze({ kind: 'UnusableUrl' })

// URL construction may throw. Both invalid syntax and disallowed protocols
// become the same explicit outcome; neither is represented by a null sentinel.
const webUrl = tryCatch(
	pipe(
		value => new URL(value),
		ifElse(
			url => ['https:', 'http:'].includes(url.protocol),
			pipe(prop('href'), UsableUrl),
			() => UnusableUrl,
		),
	),
	() => UnusableUrl,
)

const storyUrl = hit =>
	ifElse(propEq('UsableUrl', 'kind'), prop('href'), () => discussionUrl(hit))(
		webUrl(hit.url),
	)

export const storyData = hit => ({
	title: hit.title,
	url: storyUrl(hit),
})

const acceptResponse = ifElse(prop('ok'), succeed, response =>
	fail(`Service returned HTTP ${response.status}.`),
)

const failureMessage = cond([
	[propEq('AbortError', 'name'), () => 'The request timed out. Try again.'],
	[is(String), identity],
	[pipe(prop('message'), is(String)), prop('message')],
	[T, () => 'The service could not be reached.'],
])

const searchUrl = query =>
	`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&query=${encodeURIComponent(query)}`

const requestDeadline = task(() => {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 12000)
	return { controller, timeout }
})

const fetchStories =
	query =>
	({ controller }) =>
		flow(
			task(() => fetch(searchUrl(query), { signal: controller.signal })),
			[
				andThen(acceptResponse),
				andThen(response => task(() => response.json())),
				andThen(decodeSearchResponse),
				mapTask(map(storyData)),
			],
		)

export const searchProgram = query =>
	flow(
		using(requestDeadline, fetchStories(query), ({ timeout }) =>
			clearTimeout(timeout),
		),
		[mapError(failureMessage)],
	)

export const saveProgram = text =>
	flow(
		task(() => localStorage.setItem(storageKey, text)),
		[mapError(() => 'This browser could not save the query.')],
	)

const requireSavedDraft = ifElse(isNil, () => fail('No saved query yet.'), succeed)

export const restoreProgram = flow(
	task(() => localStorage.getItem(storageKey)),
	[
		mapError(() => 'This browser could not read saved queries.'),
		andThen(requireSavedDraft),
	],
)

const requireClipboard = ifElse(
	clipboard => typeof clipboard?.writeText === 'function',
	succeed,
	() => fail('Clipboard access is unavailable in this browser.'),
)

const writeClipboard = text => clipboard =>
	flow(
		task(() => clipboard.writeText(text)),
		[mapError(() => 'Clipboard access was denied.')],
	)

export const copyProgram = text =>
	flow(
		task(() => globalThis.navigator?.clipboard),
		[andThen(requireClipboard), andThen(writeClipboard(text))],
	)

export const waitProgram = milliseconds =>
	task(() => new Promise(resolve => setTimeout(resolve, milliseconds)))

// The clock's synchronous function is also composed before it is called.
export const now = pipe(
	() => new Date(),
	date =>
		date.toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		}),
)
