import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'

const dom = new Window()
Object.assign(globalThis, { window: dom, document: dom.document,
  AbortController: dom.AbortController })
const { start } = await import('../build/dev/javascript/values_browser_lab/app/app.mjs')
const { searchPanel } = await import('../build/dev/javascript/values_browser_lab/app/view.mjs')
const { render } = await import('lit-html')
const markup = readFileSync('index.html', 'utf8').match(/<body>([\s\S]*?)<\/body>/)[1]
import * as model from '../build/dev/javascript/values_browser_lab/app/model.mjs'
import { update } from '../build/dev/javascript/values_browser_lab/app/domain.mjs'
import { view, subscriptions } from '../build/dev/javascript/values_browser_lab/app/presentation.mjs'
import * as query from '../build/dev/javascript/values_browser_lab/app/query.mjs'
import { Ok, Error as GleamError, toList } from '../build/dev/javascript/values_browser_lab/gleam.mjs'

function mount(t) {
  document.body.innerHTML = markup
  const elements = { get: id => document.getElementById(id) }
  const actions = {
    edit: text => new model.UserEditedDraftQuery(query.from_input(text)),
    search: new model.UserSubmittedSearch(),
    save: new model.UserRequestedDraftSave(), restore: new model.UserRequestedDraftRestore(),
    toggle_clock: new model.UserRequestedLiveClockToggle(),
    tick: text => new model.ClockTicked(new model.ClockReading(text)),
  }
  let saved
  const perform = (effect, dispatch) => {
    if (effect instanceof model.SearchService)
      dispatch(new model.HttpReturnedSearchResult(effect[0], new Ok(toList([
        new model.Story(new model.StoryTitle('A story'), new model.StoryUrl('https://example.com')),
      ]))))
    if (effect instanceof model.SaveDraft) {
      saved = effect[0]
      dispatch(new model.StorageReturnedSaveResult(new Ok(undefined)))
    }
    if (effect instanceof model.ReadDraft)
      dispatch(new model.StorageReturnedReadResult(saved
        ? new Ok(saved) : new GleamError(new model.FailureReason('No saved query yet.'))))

  }
  const app = start(model.initial(), update, view, subscriptions, perform, actions)
  t.after(() => app.dispose())
  return { app, elements, click: id => elements.get(id).dispatchEvent(new dom.Event('click')) }
}

test('template events update the model and preserve input and story nodes across unrelated turns', t => {
  const { elements, click } = mount(t)
  elements.get('query').value = 'values'
  elements.get('query').dispatchEvent(new dom.Event('input'))
  assert.equal(elements.get('search-form').dispatchEvent(new dom.Event('submit', { cancelable: true })), false)
  assert.equal(elements.get('search-status').textContent, 'Stories found')
  assert.match(elements.get('model-value').textContent, /values/)
  assert.equal(document.getElementById('activity'), null)
  assert.equal('activity' in JSON.parse(elements.get('model-value').textContent), false)
  const result = elements.get('results').firstElementChild
  const input = elements.get('query')
  input.focus()
  const inspector = document.querySelector('details')
  inspector.open = true
  click('save-query')
  assert.equal(elements.get('storage-status').textContent, 'Saved in this browser.')
  assert.equal(elements.get('results').firstElementChild, result)
  assert.equal(elements.get('query'), input)
  assert.equal(document.activeElement, input)
  assert.equal(document.querySelector('details'), inspector)
  assert.equal(inspector.open, true)
})

test('app owns one clock, pauses and resumes it, and removes listeners on disposal', t => {
  const callbacks = [], canceled = []
  t.mock.method(globalThis, 'setInterval', callback => { callbacks.push(callback); return callbacks.length })
  t.mock.method(globalThis, 'clearInterval', handle => canceled.push(handle))
  const { app, elements, click } = mount(t)
  document.querySelector('details').open = true
  const inspectClock = () => JSON.parse(elements.get('model-value').textContent).clock
  assert.equal(inspectClock().mode.type, 'ManualClock')
  click('clock-toggle')
  assert.equal(inspectClock().mode.type, 'LiveClock')
  callbacks[0]()
  assert.notEqual(elements.get('clock-value').textContent.trim(), 'Not read yet')
  assert.equal(inspectClock().display.type, 'ClockRead')
  assert.equal(inspectClock().display[0][0], elements.get('clock-value').textContent.trim())
  assert.equal(document.querySelector('details').open, true)
  assert.equal(callbacks.length, 1)
  window.dispatchEvent(new dom.Event('pagehide'))
  assert.deepEqual(canceled, [1])
  window.dispatchEvent(new dom.Event('pageshow'))
  assert.equal(callbacks.length, 2)
  const inspector = elements.get('model-value')
  const inspected = inspector.textContent
  const toggle = elements.get('clock-toggle')
  app.dispose()
  assert.deepEqual(canceled, [1, 2])
  assert.equal(document.getElementById('app').childElementCount, 0)
  toggle.dispatchEvent(new dom.Event('click'))
  callbacks[1]()
  window.dispatchEvent(new dom.Event('pageshow'))
  assert.equal(callbacks.length, 2)
  assert.equal(inspector.textContent, inspected)
})

test('template construction is a value; rendering escapes text and events only dispatch on interaction', () => {
  document.body.innerHTML = '<section id="search-panel"></section>'
  const container = document.getElementById('search-panel')
  const messages = []
  const description = searchPanel({
    draft: 'values', status: '<b>Ready</b>', query: 'values',
    stories: toList([{ title: '<img src=x onerror=bad()>', url: 'https://example.com' }]),
  }, message => messages.push(message), { edit: text => ['edit', text], search: 'search' })
  assert.equal(container.childNodes.length, 0)
  assert.deepEqual(messages, [])
  render(description, container)
  assert.equal(container.querySelector('h3').textContent, '<b>Ready</b>')
  assert.equal(container.querySelector('img'), null)
  assert.equal(container.querySelector('a').textContent.trim(), '<img src=x onerror=bad()>')
  assert.deepEqual(messages, [])
  const input = container.querySelector('input')
  input.value = 'new query'
  input.dispatchEvent(new dom.Event('input'))
  const submission = new dom.Event('submit', { cancelable: true })
  container.querySelector('form').dispatchEvent(submission)
  assert.equal(submission.defaultPrevented, true)
  assert.deepEqual(messages, [['edit', 'new query'], 'search'])
})

test('storage template events report outcomes and restore the input', t => {
  const { elements, click } = mount(t)
  const input = elements.get('query')
  input.value = 'saved words'
  input.dispatchEvent(new dom.Event('input'))
  click('save-query')
  assert.equal(elements.get('storage-status').textContent, 'Saved in this browser.')
  input.value = 'changed words'
  input.dispatchEvent(new dom.Event('input'))
  click('restore-query')
  assert.equal(elements.get('query'), input)
  assert.equal(input.value, 'saved words')
  assert.equal(elements.get('storage-status').textContent, 'Saved query restored.')
})
