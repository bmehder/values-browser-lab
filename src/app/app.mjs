import { render, nothing } from 'lit-html'
import { create, Config } from '../valuz/runtime.mjs'
import { appView } from './view.mjs'
import { EverySecond } from './model.mjs'
import { now } from './browser.mjs'

// The browser host chooses a renderer and owns its live-clock resources.
export function start(initial, update, view, subscriptions, perform, actions) {
	const root = document.getElementById('app')
	const listeners = new AbortController()
	const dispatch = message => runtime.dispatch(message)
	let interval
	let wantsClock = false
	let paused = false

	const stopClock = () => {
		if (interval !== undefined) clearInterval(interval)
		interval = undefined
	}
	const updateClock = () => {
		if (!wantsClock || paused) stopClock()
		else if (interval === undefined)
			interval = setInterval(() => dispatch(actions.tick(now())), 1000)
	}
	const runtime = create(
		new Config(
			initial,
			update,
			model => appView(view(model), model, dispatch, actions),
			subscriptions,
			description => render(description, root),
			descriptions => {
				wantsClock = Array.from(descriptions).some(
					value => value instanceof EverySecond,
				)
				updateClock()
			},
			perform,
			() => undefined,
		),
	)

	window.addEventListener(
		'pagehide',
		() => {
			paused = true
			updateClock()
		},
		{ signal: listeners.signal },
	)
	window.addEventListener(
		'pageshow',
		() => {
			paused = false
			updateClock()
		},
		{ signal: listeners.signal },
	)
	runtime.refresh()

	return {
		dispose: () => {
			runtime.stop()
			listeners.abort()
			stopClock()
			render(nothing, root)
		},
	}
}
