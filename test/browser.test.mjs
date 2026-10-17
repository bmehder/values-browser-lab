import test from 'node:test'
import assert from 'node:assert/strict'
// npm test runs gleam test first, which copies the FFI beside its generated imports.
import { copy, decodeStories, restore, save, search } from '../build/dev/javascript/values_browser_lab/browser.mjs'

function setGlobal(t, name, value) {
  const before = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  t.after(() => before
    ? Object.defineProperty(globalThis, name, before)
    : delete globalThis[name])
}

function callbacks() {
  const successes = [], failures = []
  return { successes, failures, success: value => successes.push(value), failure: reason => failures.push(reason) }
}

test('external data is validated before creating Gleam stories', () => {
  for (const body of [null, {}, { hits: [null] }, { hits: [{ title: 42, objectID: '1' }] },
    { hits: [{ title: 'Hi', objectID: '1', url: 42 }] }])
    assert.throws(() => decodeStories(body), { name: "ValiError" })
  const stories = decodeStories({ hits: [{ title: 'Hi', objectID: '1' }] }).toArray()
  assert.equal(stories[0].title[0], 'Hi')
})

test('missing and unsafe links use the discussion page', () => {
  for (const url of [null, undefined, 'javascript:alert(1)', 'data:text/html,test', 'not a URL']) {
    const story = decodeStories({ hits: [{ title: 'Hi', objectID: '12', url }] }).toArray()[0]
    assert.equal(story.url[0], 'https://news.ycombinator.com/item?id=12')
  }
  const story = decodeStories({ hits: [{ title: 'Hi', objectID: '12', url: 'https://example.com' }] }).toArray()[0]
  assert.equal(story.url[0], 'https://example.com/')
})

test('search encodes its query, returns typed stories once, and clears its timeout', async t => {
  let cleared = 0
  const originalClear = globalThis.clearTimeout
  t.mock.method(globalThis, 'clearTimeout', handle => { cleared++; originalClear(handle) })
  t.mock.method(globalThis, 'fetch', async url => {
    assert.match(url, /query=hello%20world/)
    return { ok: true, json: async () => ({ hits: [{ title: 'Hi', objectID: '1', url: null }] }) }
  })
  const result = callbacks()
  await search('hello world', result.success, result.failure)
  assert.equal(result.successes.length, 1)
  assert.equal(result.successes[0].toArray().length, 1)
  assert.deepEqual(result.failures, [])
  assert.equal(cleared, 1)
})

test('HTTP and JSON failures report once and still release the timeout', async t => {
  let cleared = 0
  const originalClear = globalThis.clearTimeout
  t.mock.method(globalThis, 'clearTimeout', handle => { cleared++; originalClear(handle) })
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }))
  const http = callbacks()
  await search('values', http.success, http.failure)
  assert.deepEqual(http.failures, ['Service returned HTTP 503.'])
  assert.deepEqual(http.successes, [])
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON') } }))
  const json = callbacks()
  await search('values', json.success, json.failure)
  assert.deepEqual(json.failures, ['Invalid JSON'])
  assert.equal(cleared, 2)
})

test('an aborted search reports the timeout explanation', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('aborted', 'AbortError') })
  const result = callbacks()
  await search('values', result.success, result.failure)
  assert.deepEqual(result.failures, ['The request timed out. Try again.'])
})

test('save and restore distinguish missing drafts from saved empty text', t => {
  let stored = null
  setGlobal(t, 'localStorage', { getItem: () => stored, setItem: (_, value) => { stored = value } })
  const missing = callbacks()
  restore(missing.success, missing.failure)
  assert.deepEqual(missing.failures, ['No saved query yet.'])
  const saved = callbacks()
  save('', saved.success, saved.failure)
  assert.equal(saved.successes.length, 1)
  const restored = callbacks()
  restore(restored.success, restored.failure)
  assert.deepEqual(restored.successes, [''])
})

test('storage exceptions become storage failures', t => {
  setGlobal(t, 'localStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
  const saving = callbacks(), reading = callbacks()
  save('values', saving.success, saving.failure)
  restore(reading.success, reading.failure)
  assert.deepEqual(saving.failures, ['This browser could not save the query.'])
  assert.deepEqual(reading.failures, ['This browser could not read saved queries.'])
})

test('clipboard handles absent support, denied access, and successful writes', async t => {
  setGlobal(t, 'navigator', {})
  const absent = callbacks()
  await copy('values', absent.success, absent.failure)
  assert.deepEqual(absent.failures, ['Clipboard access is unavailable in this browser.'])
  setGlobal(t, 'navigator', { clipboard: { writeText: async () => { throw new Error('denied') } } })
  const denied = callbacks()
  await copy('values', denied.success, denied.failure)
  assert.deepEqual(denied.failures, ['Clipboard access was denied.'])
  let written
  setGlobal(t, 'navigator', { clipboard: { writeText: async text => { written = text } } })
  const result = callbacks()
  await copy('values', result.success, result.failure)
  assert.equal(written, 'values')
  assert.equal(result.successes.length, 1)
  assert.deepEqual(result.failures, [])
})

test('application callback bugs do not trigger a second failure callback', async t => {
  setGlobal(t, 'localStorage', { setItem() {} })
  let failures = 0
  const broken = () => { throw new Error('application bug') }
  assert.throws(() => save('values', broken, () => failures++), /application bug/)
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ hits: [] }) }))
  await assert.rejects(search('values', broken, () => failures++), /application bug/)
  assert.equal(failures, 0)
})

test('malformed service data keeps the application error message', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ hits: [null] }) }))
  const result = callbacks()
  await search('values', result.success, result.failure)
  assert.deepEqual(result.failures, ['The service returned an unexpected response.'])
  assert.deepEqual(result.successes, [])
})

test('clipboard getter and synchronous write exceptions report denied access', async t => {
  setGlobal(t, 'navigator', { get clipboard() { throw new Error('blocked') } })
  const getter = callbacks()
  await copy('values', getter.success, getter.failure)
  assert.deepEqual(getter.failures, ['Clipboard access was denied.'])
  setGlobal(t, 'navigator', { clipboard: { writeText() { throw new Error('blocked') } } })
  const write = callbacks()
  await copy('values', write.success, write.failure)
  assert.deepEqual(write.failures, ['Clipboard access was denied.'])
})

test('restore and clipboard callback bugs stay outside operation failure handling', async t => {
  setGlobal(t, 'localStorage', { getItem: () => 'values' })
  setGlobal(t, 'navigator', { clipboard: { writeText: async () => {} } })
  const failures = []
  const broken = () => { throw new Error('application bug') }
  assert.throws(() => restore(broken, reason => failures.push(reason)), /application bug/)
  await assert.rejects(copy('values', broken, reason => failures.push(reason)), /application bug/)
  assert.deepEqual(failures, [])
})
