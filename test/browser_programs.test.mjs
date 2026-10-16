import test from 'node:test'
import assert from 'node:assert/strict'
import { task, succeed, using, run } from '../src/task.mjs'
import { copyProgram, decodeSearchResponse, restoreProgram, saveProgram,
  searchProgram, storyData } from '../src/browser_programs.mjs'

const setGlobal = (t, name, value) => {
  const before = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  t.after(() => before
    ? Object.defineProperty(globalThis, name, before)
    : delete globalThis[name])
}
const rejectsWith = (program, message) => assert.rejects(program.run(), reason => reason === message)

test('program construction is lazy and reusable', async () => {
  let calls = 0
  const program = task(() => ++calls).map(number => number * 2)
  assert.equal(calls, 0)
  assert.equal(await program.run(), 2)
  assert.equal(await program.run(), 4)
})

test('composition converts a thrown browser exception into one failure path', async () => {
  let later = 0
  const program = succeed('start')
    .andThen(() => task(() => { throw new Error('blocked') }))
    .map(() => ++later)
    .mapError(error => error.message)
  await rejectsWith(program, 'blocked')
  assert.equal(later, 0)
})

test('resource cleanup also runs when building the dependent program throws', async () => {
  let released = 0
  const program = using(succeed('resource'), () => { throw new Error('failed') }, () => released++)
  await assert.rejects(program.run(), /failed/)
  assert.equal(released, 1)
})

test('schema rejects malformed external data, including one invalid story', async () => {
  await rejectsWith(decodeSearchResponse({ hits: [{ title: 42, objectID: '1' }] }),
    'The service returned an unexpected response.')
  await rejectsWith(decodeSearchResponse({ unexpected: [] }),
    'The service returned an unexpected response.')
})

test('unsafe and missing URLs become discussion links', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', null, 'not a URL']) {
    assert.equal(storyData({ title: 'Example', objectID: '12', url }).url,
      'https://news.ycombinator.com/item?id=12')
  }
  assert.equal(storyData({ title: 'Example', objectID: '12', url: 'https://example.com' }).url,
    'https://example.com/')
})

test('search runs only at execution and releases its deadline on success', async t => {
  let calls = 0, released = 0
  const originalClear = globalThis.clearTimeout
  t.mock.method(globalThis, 'clearTimeout', timer => { released++; originalClear(timer) })
  t.mock.method(globalThis, 'fetch', async url => {
    calls++
    assert.match(url, /query=hello%20world/)
    return { ok: true, json: async () => ({ hits: [{ title: 'Hello', objectID: '1', url: null }] }) }
  })
  const program = searchProgram('hello world')
  assert.equal(calls, 0)
  const result = await program.run()
  assert.equal(calls, 1)
  assert.deepEqual(result, [{ title: 'Hello', url: 'https://news.ycombinator.com/item?id=1' }])
  assert.equal(released, 1)
})

test('HTTP and decoding failures release the deadline', async t => {
  let released = 0
  const originalClear = globalThis.clearTimeout
  t.mock.method(globalThis, 'clearTimeout', timer => { released++; originalClear(timer) })
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }))
  await rejectsWith(searchProgram('test'), 'Service returned HTTP 503.')
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON') } }))
  await rejectsWith(searchProgram('test'), 'Invalid JSON')
  assert.equal(released, 2)
})

test('abort becomes a timeout message', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('aborted', 'AbortError') })
  await rejectsWith(searchProgram('test'), 'The request timed out. Try again.')
})

test('the same restore program reads current storage on every run', async t => {
  let saved = null
  setGlobal(t, 'localStorage', { getItem: () => saved, setItem: (_, value) => { saved = value } })
  await rejectsWith(restoreProgram, 'No saved query yet.')
  const save = saveProgram('values')
  assert.equal(saved, null)
  await save.run()
  assert.equal(await restoreProgram.run(), 'values')
  saved = 'functions'
  assert.equal(await restoreProgram.run(), 'functions')
})

test('storage exceptions become descriptive failures', async t => {
  setGlobal(t, 'localStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
  await rejectsWith(saveProgram('values'), 'This browser could not save the query.')
  await rejectsWith(restoreProgram, 'This browser could not read saved queries.')
})

test('clipboard absence and rejected permission have distinct outcomes', async t => {
  setGlobal(t, 'navigator', { clipboard: undefined })
  await rejectsWith(copyProgram('hello'), 'Clipboard access is unavailable in this browser.')
  setGlobal(t, 'navigator', { clipboard: { writeText: async () => { throw new Error('denied') } } })
  await rejectsWith(copyProgram('hello'), 'Clipboard access was denied.')
})

test('run delivers success or failure once', async () => {
  const values = []
  await new Promise(resolve => run(succeed('ok'), value => { values.push(value); resolve() }, () => values.push('failed')))
  assert.deepEqual(values, ['ok'])
})
