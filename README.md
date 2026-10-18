# Valuz Browser Lab

**Describe what happens. Compose what happens next.**

Valuz is a small Gleam runtime for Model–View–Update (MVU) applications. Browser Lab demonstrates it with named domain types, messages that select pure operations, phantom-typed query preparation, and explicitly interpreted browser effects. It needs no API key.

## Run

```sh
cd ~/Developer/Gleam/values-browser-lab
npm install
gleam deps download
npm start
```

Open http://127.0.0.1:8000. Stop with Ctrl+C. Dependencies are already installed on this computer. After editing source, run `npm run build` and refresh the browser.

```sh
npm run check
```

Checks formatting, runs the Gleam and JavaScript tests (including compiler checks for the query stages), and builds the app.

Open **Docs** in the app header to read the guide and quick reference in your browser. Documentation pages rebuild with `npm run build`.

## Understand the project

- **[Full guide](docs/guide.md):** the architecture, domain types, phantom types explained from first principles, JavaScript reading help, composition, a complete search walkthrough, and troubleshooting.
- **[Quick reference](docs/reference.md):** file map, vocabulary, request/result pairs, commands, and design boundaries.
- **[Runtime contract](docs/runtime-contract.md):** turn ordering, three execution traces, ownership, and the missing interpretation-failure policy.

If you are returning after a few months, start with the quick reference. If phantom types or the JavaScript composition are unfamiliar, read the relevant chapters of the full guide with the source beside them.

## Architecture and implementation

Valuz retains the model, processes messages in order, publishes view and subscription descriptions, and hands effects to the supplied performer. The browser effects use ordinary JavaScript functions, async/await, and explicit error handling. Valibot validates external response data; it is an implementation choice rather than part of Valuz’s design. The earlier Ramda/Valibot/task implementation and its docs are saved locally on `archive/functional-javascript` (commit `29bb212`).

Phantom query stages use constructorless labels (`pub type Unchecked`, `pub type Searchable`). The opaque query API controls which values may become searchable.

## Try it

Search Hacker News, read the clock, enable live ticks, save and restore a query, copy it, or start a timer. The activity panel shows messages and requested effects. The inspector shows the current model.

Search uses the public Hacker News Algolia API and needs an internet connection. It sends only queries you submit, with no search at startup. Saved drafts stay in this browser's local storage. Clipboard availability depends on the browser. This is a local teaching app, with an intentionally small coordinator and renderer.

The existing folder, Gleam package identifier, and GitHub repository retain their current names. Valuz is the runtime; Browser Lab is the example app. Reusable code has not yet been extracted into a separate package.

## The Value of Values

Read the [extended talk](docs/talk.md) for a guided tour of the philosophy, the application cycle, and each file’s responsibility. With the app running, choose **The talk** in the header, or open `/docs/talk.html`. The page includes ten static SVG visuals and a Markdown download.

## Source layout

- `src/valuz/runtime.gleam`: the generic, typed coordinator.
- `src/valuz/runtime_ffi.mjs`: reference storage and exception cleanup.
- `src/app/*.gleam`: application types, update, operations, presentation, query preparation, and effect interpretation.
- `src/main.gleam`: application startup and wiring.
- `src/app/app.mjs`: connect template rendering and the live-clock lifecycle.
- `src/app/view.mjs`: declarative markup and message-producing events for every panel.
- `src/app/browser.mjs`: browser effects and Valibot response validation.

The project implements one browser application. The coordinator accepts plain functions so its contract does not depend on a renderer, but we do not maintain an additional CLI or a set of adapter factories.

The interface uses standalone lit-html, with no signals or component framework. The host composes `Model → Screen → TemplateResult` and supplies `render` as the presenter. The coordinator and Gleam application decisions remain independent of that renderer.
