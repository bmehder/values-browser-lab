// Browser effects. Application decisions stay in Gleam.
import * as v from 'valibot'
import { Story, StoryTitle, StoryUrl } from './model.mjs'
import { toList } from '../../gleam_stdlib/gleam.mjs'

const storageKey = 'values-browser-lab:draft'
const SearchResponse = v.object({
  hits: v.array(v.object({
    title: v.string(), objectID: v.string(),
    url: v.optional(v.nullable(v.string())),
  })),
})

export const now = () => new Date().toLocaleTimeString([], {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function storyUrl(hit) {
  const fallback = `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`
  try {
    const url = new URL(hit.url)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    // Missing or malformed URLs use the discussion page.
  }
  return fallback
}

export function decodeStories(body) {
  const { hits } = v.parse(SearchResponse, body)
  return toList(hits.map(hit =>
    new Story(new StoryTitle(hit.title), new StoryUrl(storyUrl(hit)))))
}

function searchFailure(error) {
  if (error?.name === 'AbortError') return 'The request timed out. Try again.'
  if (error instanceof v.ValiError) return 'The service returned an unexpected response.'
  return error?.message ?? 'The service could not be reached.'
}

async function fetchStories(query) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&query=${encodeURIComponent(query)}`
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`Service returned HTTP ${response.status}.`)
    return decodeStories(await response.json())
  } finally {
    clearTimeout(timeout)
  }
}

// Sibling handlers keep callback bugs separate from failed browser operations.
export const search = (query, success, failure) =>
  fetchStories(query).then(success, error => failure(searchFailure(error)))

export function save(text, success, failure) {
  try {
    localStorage.setItem(storageKey, text)
  } catch {
    failure('This browser could not save the query.')
    return
  }
  success()
}

export function restore(success, failure) {
  let text
  try {
    text = localStorage.getItem(storageKey)
  } catch {
    failure('This browser could not read saved queries.')
    return
  }
  if (text === null) failure('No saved query yet.')
  else success(text)
}

async function writeClipboard(text) {
  let clipboard
  try {
    clipboard = globalThis.navigator?.clipboard
  } catch {
    throw new Error('Clipboard access was denied.')
  }
  if (typeof clipboard?.writeText !== 'function')
    throw new Error('Clipboard access is unavailable in this browser.')
  try {
    await clipboard.writeText(text)
  } catch {
    throw new Error('Clipboard access was denied.')
  }
}

export const copy = (text, success, failure) =>
  writeClipboard(text).then(success, error => failure(error.message))

export const delay = (milliseconds, finished) => setTimeout(finished, milliseconds)
