// Ordinary JavaScript at the browser boundary. Application decisions stay in Gleam.
import { Story, StoryTitle, StoryUrl } from './model.mjs'
import { toList } from '../gleam_stdlib/gleam.mjs'

const storageKey = 'values-browser-lab:draft'

export function now() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function storyUrl(hit) {
  const fallback = `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`
  try {
    const url = new URL(hit.url)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  } catch {
    // Missing or malformed links use the story's discussion page.
  }
  return fallback
}

// JSON is untrusted until checked. Return actual Gleam values, not lookalike arrays.
export function decodeStories(body) {
  if (!body || !Array.isArray(body.hits))
    throw new Error('The service returned an unexpected response.')

  const stories = body.hits.map(hit => {
    if (!hit || typeof hit.title !== 'string' || typeof hit.objectID !== 'string' ||
        (hit.url != null && typeof hit.url !== 'string'))
      throw new Error('The service returned an unexpected response.')

    return new Story(new StoryTitle(hit.title), new StoryUrl(storyUrl(hit)))
  })
  return toList(stories)
}

function searchFailure(error) {
  if (error?.name === 'AbortError') return 'The request timed out. Try again.'
  if (typeof error?.message === 'string') return error.message
  return 'The service could not be reached.'
}

export async function search(query, success, failure) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  let stories
  try {
    const url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&query=${encodeURIComponent(query)}`
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`Service returned HTTP ${response.status}.`)
    const body = await response.json()
    stories = decodeStories(body)
  } catch (error) {
    failure(searchFailure(error))
    return
  } finally {
    clearTimeout(timeout)
  }
  // Keep application callbacks outside the browser-operation try/catch.
  // A bug in success must not be reported as a second, failed search result.
  success(stories)
}

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
  if (text === null) {
    failure('No saved query yet.')
    return
  }
  success(text)
}

export async function copy(text, success, failure) {
  let clipboard
  try {
    clipboard = globalThis.navigator?.clipboard
  } catch {
    failure('Clipboard access was denied.')
    return
  }
  if (typeof clipboard?.writeText !== 'function') {
    failure('Clipboard access is unavailable in this browser.')
    return
  }
  try {
    await clipboard.writeText(text)
  } catch {
    failure('Clipboard access was denied.')
    return
  }
  success()
}

export function delay(milliseconds, finished) {
  setTimeout(finished, milliseconds)
}
