# Valuz Browser Lab

**Describe what happens. Compose what happens next.**

Valuz is an emerging framework for programming with values. Valuz Browser Lab is its runnable Gleam example: named domain types, messages that select pure operations, phantom-typed query preparation, and explicitly interpreted browser effects. It uses our own small coordinator and needs no API key.

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

- **[Full guide](docs/guide.md):** the architecture, domain types, phantom types explained from first principles, JavaScript reading help, task composition, a complete search walkthrough, and troubleshooting.
- **[Quick reference](docs/reference.md):** file map, vocabulary, request/result pairs, commands, and design boundaries.

If you are returning after a few months, start with the quick reference. If phantom types or the JavaScript composition are unfamiliar, read the relevant chapters of the full guide with the source beside them.

## Architecture and implementation

Valuz describes the model/message/operation/effect relationships. Ramda and Valibot are implementation choices in Browser Lab’s JavaScript adapter, not requirements of that architecture. The current app uses both and needs its declared dependencies to build.

Phantom query stages use constructorless labels (`pub type Unchecked`, `pub type Searchable`). The opaque query API controls which values may become searchable.

## Try it

Search Hacker News, read the clock, enable live ticks, save and restore a query, copy it, or start a timer. The activity panel shows messages and requested effects. The inspector shows the current model.

Search uses the public Hacker News Algolia API and needs an internet connection. It sends only queries you submit, with no search at startup. Saved drafts stay in this browser's local storage. Clipboard availability depends on the browser. This is a local teaching app, with an intentionally small coordinator and renderer.

The existing folder, Gleam package identifier, and GitHub repository retain their current names. Valuz is the framework name; Browser Lab is the example app. Reusable code has not yet been extracted into a separate package.
