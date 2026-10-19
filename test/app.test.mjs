import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { readFileSync } from 'node:fs'

const dom = new Window()
Object.assign(globalThis, { window: dom, document: dom.document,
  AbortController: dom.AbortController })
const { mount: mountBrowser } = await import('../build/dev/javascript/values_browser_lab/valuz/browser_ffi.mjs')
const { searchPanel, appView } = await import('../build/dev/javascript/values_browser_lab/app/view.mjs')
const { render } = await import('lit-html')
const markup = readFileSync('index.html', 'utf8').match(/<body>([\s\S]*?)<\/body>/)[1]
import * as model from '../build/dev/javascript/values_browser_lab/app/model.mjs'
const { Config, create_runtime } = await import('../build/dev/javascript/values_browser_lab/valuz/browser.mjs')
import { update } from '../build/dev/javascript/values_browser_lab/app/update.mjs'
import { describe } from '../build/dev/javascript/values_browser_lab/app/presentation.mjs'
import { Ok, Error as GleamError, toList } from '../build/dev/javascript/values_browser_lab/gleam.mjs'

function mount(t) {
  document.body.innerHTML = markup
  const elements = { get: id => document.getElementById(id) }
  let saved
  const perform = (effect, dispatch) => {
    if (effect instanceof model.SearchService)
      dispatch(new model.HttpReturnedSearchResult(effect.request, new Ok(toList([
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
  const config = new Config(model.initial(), update, describe, appView, perform, 'app')
  let runtime
  const app = mountBrowser(
    present => { runtime = create_runtime(config, present); return runtime },
    ([screen, model], dispatch) => appView(screen, model, dispatch),
    'app',
  )
  t.after(() => app.dispose())
  return { app, runtime, elements, click: id => elements.get(id).dispatchEvent(new dom.Event('click')) }
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

test('disposal clears the view and ignores late messages', t => {
  const { app, runtime, elements } = mount(t)
  const inspector = elements.get('model-value')
  const inspected = inspector.textContent
  app.dispose()
  runtime.dispatch(new model.UserSubmittedSearch())
  runtime.refresh()
  assert.equal(document.getElementById('app').childElementCount, 0)
  assert.equal(inspector.textContent, inspected)
})

test('template construction is a value; rendering escapes text and events only dispatch on interaction', () => {
  document.body.innerHTML = '<section id="search-panel"></section>'
  const container = document.getElementById('search-panel')
  const messages = []
  const description = searchPanel({
    draft: 'values', status: '<b>Ready</b>', search_detail: 'values',
    stories: toList([{ title: '<img src=x onerror=bad()>', url: 'https://example.com' }]),
  }, message => messages.push(message))
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
  assert.ok(messages[0] instanceof model.UserEditedDraftQuery)
  assert.equal(messages[0][0][0], 'new query')
  assert.ok(messages[1] instanceof model.UserSubmittedSearch)
  assert.equal(messages.length, 2)
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


test('missing mount target is reported before the runtime is created', () => {
  document.body.innerHTML = ''
  let created = false
  assert.throws(
    () => mountBrowser(() => { created = true }, appView, 'missing'),
    /Valuz could not find the mount target #missing/,
  )
  assert.equal(created, false)
})
