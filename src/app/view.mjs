// Interface descriptions only. Building a template does not update the DOM.
import { html } from 'lit-html'

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
		<p>Read once, or subscribe to a tick every second.</p>
		<div class="buttons">
			<button id="read-time" @click=${() => dispatch(actions.time)}>
				Read time
			</button>
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

const clipboardPanel = (screen, dispatch, actions) => html`
	<section class="panel">
		<p class="eyebrow">04 / CLIPBOARD</p>
		<h2>Take it with you.</h2>
		<p id="clipboard-status" aria-live="polite">${screen.clipboard}</p>
		<button id="copy-query" @click=${() => dispatch(actions.copy)}>
			Copy query <span aria-hidden="true">↗</span>
		</button>
	</section>
`

const timerPanel = (screen, dispatch, actions) => html`
	<section class="panel">
		<p class="eyebrow">05 / TIMER</p>
		<h2>Later is a message.</h2>
		<p id="timer-status" aria-live="polite">${screen.timer}</p>
		<button id="timer-button" @click=${() => dispatch(actions.timer)}>
			${screen.timer_action_label}
		</button>
	</section>
`

const formatModel = model =>
	JSON.stringify(
		model,
		(_, value) =>
			value && typeof value.toArray === 'function' ? value.toArray() : value,
		2,
	)

const activityPanel = (history, model) => {
	const entries = history.toArray()
	return html`
		<aside class="panel activity-panel">
			<div class="section-top">
				<span class="eyebrow">THE CONVERSATION</span>
				<span id="activity-count" class="pill">${entries.length}</span>
			</div>
			<h2>Watch it unfold.</h2>
			<p>
				Newest message first. Each line shows what the chosen operation requested.
			</p>
			<p id="empty-activity" class="empty" ?hidden=${entries.length > 0}>
				Try one of the controls.<br />Your program’s decisions will appear here.
			</p>
			<ol id="activity" class="activity">
				${entries.map(
					(text, index) => html`
						<li>
							<span>${String(entries.length - index).padStart(2, '0')}</span
							><code>${text}</code>
						</li>
					`,
				)}
			</ol>
			<details>
				<summary>Inspect the current model</summary>
				<pre id="model-value">${formatModel(model)}</pre>
			</details>
		</aside>
	`
}

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
			${clipboardPanel(screen, dispatch, actions)}
			${timerPanel(screen, dispatch, actions)}
		</div>
	</div>
	${activityPanel(screen.history, model)}
`
