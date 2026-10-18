import test from 'node:test'
import assert from 'node:assert/strict'
import { create, Config } from '../build/dev/javascript/values_browser_lab/valuz/runtime.mjs'
import { toList } from '../build/dev/javascript/values_browser_lab/gleam.mjs'

// Supply Gleam lists at the compiled module boundary.
const createRuntime = config => create(new Config(
  config.initial,
  message => model => {
    const [next, effects] = config.update(message)(model)
    return [next, toList(effects)]
  },
  config.view, model => toList(config.subscriptions(model)),
  config.present, config.reconcile, config.perform, config.observe ?? (() => {}),
))

const defaults = overrides => ({
  initial: 0, update: amount => value => [value + amount, []],
  view: value => `screen:${value}`, subscriptions: () => [],
  present: () => {}, reconcile: () => {}, perform: () => {}, ...overrides,
})

test('coordinator retains the next model and queues synchronous effect responses', () => {
  const events = []
  let dispatching = false
  const runtime = createRuntime(defaults({
    update: message => value => {
      assert.equal(dispatching, false)
      events.push(`update:${message}:${value}`)
      return [value + 1, message === 'start' ? ['respond'] : []]
    },
    present: screen => events.push(screen),
    observe: value => events.push(`retain:${value}`),
    reconcile: () => events.push('reconcile'),
    perform: (_, dispatch) => {
      dispatching = true
      events.push('perform')
      dispatch('response')
      dispatching = false
    },
  }))
  runtime.dispatch('start')
  assert.deepEqual(events, ['update:start:0', 'screen:1', 'retain:1', 'reconcile',
    'perform', 'update:response:1', 'screen:2', 'retain:2', 'reconcile'])
})

test('initial subscription responses are queued until the first publication finishes', () => {
  const events = []
  let sent = false
  const runtime = createRuntime(defaults({
    present: screen => events.push(screen),
    reconcile: (_, dispatch) => {
      events.push('reconcile')
      if (!sent) { sent = true; dispatch(1); events.push('after-dispatch') }
    },
  }))
  runtime.refresh()
  assert.deepEqual(events, ['screen:0', 'reconcile', 'after-dispatch', 'screen:1', 'reconcile'])
})

test('stopped coordinator ignores late messages and refreshes', () => {
  const screens = []
  const runtime = createRuntime(defaults({ present: value => screens.push(value) }))
  runtime.refresh()
  runtime.dispatch(1)
  runtime.stop()
  runtime.dispatch(5)
  runtime.refresh()
  assert.deepEqual(screens, ['screen:0', 'screen:1'])
})

test('coordinator releases its processing guard if an adapter throws', () => {
  const screens = []
  const runtime = createRuntime(defaults({ present: value => {
    if (value === 'screen:1') throw new Error('adapter bug')
    screens.push(value)
  } }))
  assert.throws(() => runtime.dispatch(1), /adapter bug/)
  runtime.dispatch(1)
  assert.deepEqual(screens, ['screen:2'])
})



test('messages stay FIFO across queued batches and a long chain does not grow the stack', () => {
  const seen = []
  const runtime = createRuntime(defaults({
    update: message => value => {
      seen.push(message)
      return [value + 1, message < 10000 ? [message + 1] : []]
    },
    perform: (message, dispatch) => dispatch(message),
  }))
  runtime.dispatch(0)
  assert.equal(seen.length, 10001)
  assert.equal(seen.every((message, index) => message === index), true)
})

test('queued siblings precede messages produced by the first sibling', () => {
  const seen = []
  const runtime = createRuntime(defaults({
    update: message => value => {
      seen.push(message)
      return [value, message === 'start' ? ['a', 'b'] : message === 'a' ? ['c'] : []]
    },
    perform: (message, dispatch) => dispatch(message),
  }))
  runtime.dispatch('start')
  assert.deepEqual(seen, ['start', 'a', 'b', 'c'])
})

test('stopping during an effect clears queued replies and skips remaining effects', () => {
  const effects = [], screens = []
  const runtime = createRuntime(defaults({
    update: () => value => [value + 1, ['first', 'second']],
    present: screen => screens.push(screen),
    perform: (effect, dispatch) => {
      effects.push(effect)
      dispatch('reply')
      runtime.stop()
    },
  }))
  runtime.dispatch('start')
  assert.deepEqual(effects, ['first'])
  assert.deepEqual(screens, ['screen:1'])
})
