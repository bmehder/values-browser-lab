// Interface descriptions only. Building a template does not update the DOM.
import { html } from 'lit-html'
import { CustomType } from '../gleam.mjs'
import {
  UserEditedDraftQuery, UserSubmittedSearch, UserRequestedDraftSave,
  UserRequestedDraftRestore,
} from './model.mjs'
import { from_input } from './query.mjs'

export const searchPanel = (screen, dispatch) => html`
	<div class="section-top">
		<span class="eyebrow">01 / EXTERNAL SERVICE</span>
		<span class="pill">HACKER NEWS</span>
	</div>
	<h2>A query goes out.<br />A message comes back.</h2>
	<form
		id="search-form"
		@submit=${event => {
			event.preventDefault()
			dispatch(new UserSubmittedSearch())
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
				@input=${event => dispatch(new UserEditedDraftQuery(from_input(event.currentTarget.value)))}
			/>
			<button class="primary" type="submit">Search ↗</button>
		</div>
	</form>
	<div class="search-summary" aria-live="polite">
		<h3 id="search-status">${screen.status}</h3>
		<p id="submitted-query">${screen.search_detail}</p>
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

const storagePanel = (screen, dispatch) => html`
	<section class="panel">
		<p class="eyebrow">02 / LOCAL STORAGE</p>
		<h2>Keep a thought.</h2>
		<p id="storage-status" aria-live="polite">${screen.storage}</p>
		<div class="buttons">
			<button id="save-query" @click=${() => dispatch(new UserRequestedDraftSave())}>
				Save query
			</button>
			<button id="restore-query" @click=${() => dispatch(new UserRequestedDraftRestore())}>
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

export const appView = (screen, model, dispatch) => html`
	<div class="controls">
		<section
			class="panel search-panel"
			id="search-panel"
			aria-label="Search stories"
		>
			${searchPanel(screen, dispatch)}
		</section>
		${storagePanel(screen, dispatch)}
	</div>
	${modelInspector(model)}
`
