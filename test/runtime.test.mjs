import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'

const dom = new Window()
Object.assign(globalThis, { window: dom, document: dom.document })
const { start } = await import('../src/valuz/runtime.mjs')

// These applications use plain JavaScript models, messages, arrays, and views.
function mount(t, overrides = {}) {
  document.body.innerHTML = '<div id="app"></div>'
  const app = start({
    initial: 0,
    update: amount => value => [value + amount, []],
    view: value => `screen:${value}`,
    target: 'app',
    ...overrides,
  })
  t.after(() => app.dispose())
  return app
}

test('retains the next model and queues synchronous effect responses', t => {
  const events = []
  let dispatching = false
  const app = mount(t, {
    update: message => value => {
      assert.equal(dispatching, false)
      events.push(`update:${message}:${value}`)
      return [value + 1, message === 'start' ? ['respond'] : []]
    },
    view: value => { events.push(`screen:${value}`); return String(value) },
    perform: (_, dispatch) => {
      dispatching = true
      events.push('perform')
      dispatch('response')
      dispatching = false
    },
  })
  app.dispatch('start')
  assert.deepEqual(events, ['screen:0', 'update:start:0', 'screen:1',
    'perform', 'update:response:1', 'screen:2'])
  assert.equal(document.getElementById('app').textContent, '2')
})

test('messages dispatched during initial rendering wait until it finishes', t => {
  const events = []
  let sent = false
  mount(t, { view: (value, dispatch) => {
    events.push(`screen:${value}`)
    if (!sent) { sent = true; dispatch(1); events.push('after-dispatch') }
    return String(value)
  } })
  assert.deepEqual(events, ['screen:0', 'after-dispatch', 'screen:1'])
  assert.equal(document.getElementById('app').textContent, '1')
})

test('disposed app ignores late messages and refreshes', t => {
  const screens = []
  const app = mount(t, { view: value => { screens.push(value); return String(value) } })
  app.dispatch(1)
  app.dispose()
  app.dispatch(5)
  app.refresh()
  assert.deepEqual(screens, [0, 1])
  assert.equal(document.getElementById('app').textContent, '')
})

test('releases the processing guard if rendering throws', t => {
  const app = mount(t, { view: value => {
    if (value === 1) throw new Error('adapter bug')
    return String(value)
  } })
  assert.throws(() => app.dispatch(1), /adapter bug/)
  app.dispatch(1)
  assert.equal(document.getElementById('app').textContent, '2')
})

test('a long chain of immediate responses does not grow the stack', t => {
  const seen = []
  const app = mount(t, {
    update: message => value => {
      seen.push(message)
      return [value + 1, message < 10000 ? [message + 1] : []]
    },
    view: () => '',
    perform: (message, dispatch) => dispatch(message),
  })
  app.dispatch(0)
  assert.equal(seen.length, 10001)
  assert.equal(seen.every((message, index) => message === index), true)
})

test('queued siblings precede messages produced by the first sibling', t => {
  const seen = []
  const app = mount(t, {
    update: message => value => {
      seen.push(message)
      return [value, message === 'start' ? ['a', 'b'] : message === 'a' ? ['c'] : []]
    },
    perform: (message, dispatch) => dispatch(message),
  })
  app.dispatch('start')
  assert.deepEqual(seen, ['start', 'a', 'b', 'c'])
})

test('disposal during an effect clears queued replies and skips remaining effects', t => {
  const effects = []
  const app = mount(t, {
    update: () => value => [value + 1, ['first', 'second']],
    perform: (effect, dispatch) => {
      effects.push(effect)
      dispatch('reply')
      app.dispose()
    },
  })
  app.dispatch('start')
  assert.deepEqual(effects, ['first'])
  assert.equal(document.getElementById('app').textContent, '')
})
