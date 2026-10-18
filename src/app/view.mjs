// Interface descriptions only. Building a template does not update the DOM.
import { html } from 'lit-html'
import { CustomType } from '../gleam.mjs'

export const searchPanel = (screen, dispatch, actions) => html`
	<div class="section-top">
		<span class="eyebrow">01 / EXTERNAL SERVICE</span>
		<span class="pill">HACKER NEWS</span>
	</div>
	<h2>A query goes out.<br />A message comes back.</h2>
	<form
		id="search-form"
		@submit=${event => {
			event.preventDefault()
			dispatch(actions.search)
		}}
	>
		<label for="query">Search stories</label>
		<div class="input-row">
			<input
				id="query"
				name="query"
				autocomplete="off"
				placeholder="Try functional programming"
				.value=${screen.draft}
				@input=${event => dispatch(actions.edit(event.currentTarget.value))}
			/>
			<button class="primary" type="submit">Search ↗</button>
		</div>
	</form>
	<div class="search-summary" aria-live="polite">
		<h3 id="search-status">${screen.status}</h3>
		<p id="submitted-query">${screen.query}</p>
	</div>
	<ul id="results" class="results">
		${screen.stories
			.toArray()
			.map(
				story => html`
					<li>
						<a href=${story.url} target="_blank" rel="noopener noreferrer">
							${story.title}
						</a>
					</li>
				`,
			)}
	</ul>
	<p class="footnote">
		Search requests go to the public Hacker News search API (Algolia). Older
		responses are ignored when a newer search takes over.
	</p>
`

const timePanel = (screen, dispatch, actions) => html`
	<section class="panel">
		<p class="eyebrow">02 / TIME</p>
		<div class="clock-line">
			<span id="clock-dot" class=${`dot ${screen.clock_mode}`}></span>
			<h2 id="clock-value">${screen.clock}</h2>
		</div>
		<p>Subscribe to a tick every second.</p>
		<div class="buttons">
			<button
				id="clock-toggle"
				aria-pressed=${String(screen.clock_mode === 'live')}
				@click=${() => dispatch(actions.toggle_clock)}
			>
				${screen.clock_action_label}
			</button>
		</div>
	</section>
`

const storagePanel = (screen, dispatch, actions) => html`
	<section class="panel">
		<p class="eyebrow">03 / LOCAL STORAGE</p>
		<h2>Keep a thought.</h2>
		<p id="storage-status" aria-live="polite">${screen.storage}</p>
		<div class="buttons">
			<button id="save-query" @click=${() => dispatch(actions.save)}>
				Save query
			</button>
			<button id="restore-query" @click=${() => dispatch(actions.restore)}>
				Restore
			</button>
		</div>
	</section>
`

const formatModel = model =>
	JSON.stringify(
		model,
		(_, value) => {
			if (value && typeof value.toArray === 'function') return value.toArray()
			if (value instanceof CustomType) return { type: value.constructor.name, ...value }
			return value
		},
		2,
	)

const modelInspector = model => html`
  <details class="model-inspector">
    <summary>Inspect the current model</summary>
    <pre id="model-value">${formatModel(model)}</pre>
  </details>
`

export const appView = (screen, model, dispatch, actions) => html`
	<div class="controls">
		<section
			class="panel search-panel"
			id="search-panel"
			aria-label="Search stories"
		>
			${searchPanel(screen, dispatch, actions)}
		</section>
		<div class="tools-grid">
			${timePanel(screen, dispatch, actions)}
			${storagePanel(screen, dispatch, actions)}
		</div>
	</div>
	${modelInspector(model)}
`
