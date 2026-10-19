import { render, nothing } from 'lit-html'

// Connect the runtime to its browser presenter.
export function mount(createRuntime, view, rootId) {
	const root = document.getElementById(rootId)
	if (!root) throw new Error(`Valuz could not find the mount target #${rootId}.`)
	const dispatch = message => runtime.dispatch(message)
	const present = description => render(view(description, dispatch), root)
	const runtime = createRuntime(present)

	runtime.refresh()

	return {
		dispose() {
			runtime.stop()
			render(nothing, root)
		},
	}
}
