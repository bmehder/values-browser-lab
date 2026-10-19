# Valuz Browser Lab

Valuz is a small runtime for Model–View–Update (MVU) applications. Browser Lab is a working example: search Hacker News and save or restore the draft query in local storage.

The design follows the same broad model, view, and update pattern as [the Elm Architecture](https://guide.elm-lang.org/architecture/). Here, Gleam compiles to JavaScript and handles the application's types and pure decisions. JavaScript handles HTML templates and browser APIs through [Gleam's foreign function interface (FFI)](https://gleam.run/documentation/externals/). Gleam is the implementation language; Elm is the architectural reference.

The central idea is to describe decisions as values before executing external work. A transformation returns a new model and a list of effect descriptions. The runtime retains that model, renders it, then hands the effects to a performer. Results return as messages.

## Why programs as values?

A pure function describes a mapping from inputs to outputs. Functions are values we can select, return, and compose; composing pure functions gives us another pure function. In that sense, **a pure program is a value**.

That becomes practical when a message selects a transformation. The transformation is already a value before we apply it to a model. Its result is another value: the next model paired with descriptions of requested effects. A search request can be inspected without making a request. A view can be constructed without changing the page.

The outside world still needs execution. Describing a storage write does not save anything, and describing a search cannot tell us what the server will answer. We represent the request as data and the response handling as a function; the runtime connects those descriptions to execution, and external outcomes return as messages. An effectful program can have a value representation even though running it changes the world.

The payoff is easier reasoning. We can examine a decision without reproducing browser timing, test a stale response by supplying a message, and compose behavior without burying state changes inside callbacks. The application describes what should happen; a small runtime carries it out. That separation is the motivation for Valuz.

## Run it

Install Gleam, Node.js with npm, and Python 3. In this directory:

```sh
npm install
gleam deps download
npm start
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Stop the server with Ctrl+C. The server serves built files; after editing source, run `npm run build` and refresh the page. Change the port in the `start` script in `package.json`.

```sh
npm run build   # Compile Gleam and bundle the browser entry point
npm test        # Gleam, JavaScript, browser-integration, and compiler-contract tests
npm run check   # Check Gleam formatting, run tests, and build
```

Search uses the public Hacker News Algolia API and requires an internet connection. No API key is needed. Queries are sent only when submitted; there is no request at startup. Saved drafts remain in this browser's local storage.

## The application cycle

```text
User interaction or external result
                 |
              Message
                 |
         update selects an Operation
                 |
       Operation(current Model)
                 |
       #(next Model, Effects)
                 |
        runtime retains next Model
                 |
        describe → template → render
                 |
         perform requested Effects
                 |
         outcomes become Messages
```

An `Operation` is a function value:

```gleam
pub type Operation = fn(Model) -> #(Model, List(Effect))
```

`#(...)` is a tuple. It keeps the next model and the effects requested by that decision together. An empty effect list means there is no external work to start.

`update` chooses an operation rather than applying it. For example:

```gleam
UserSubmittedSearch -> transformations.begin_search()
UserEditedDraftQuery(query) -> transformations.edit_draft(query)
```

Those calls build and return functions. They can capture message data, but do not receive a model or perform effects yet. The runtime supplies the current model later:

```gleam
let operation = config.update(message)
let #(next_model, effects) = operation(current_model)
```

This keeps the update table readable while leaving the details in named transformations.

## Source map

Application behavior lives in `src/app/`. Reusable execution and browser startup live in `src/valuz/`.

| File | Responsibility |
|---|---|
| [src/main.gleam](src/main.gleam) | Select the application pieces and mount target |
| [src/app/model.gleam](src/app/model.gleam) | Model, messages, effects, named states, and the initial model |
| [src/app/update.gleam](src/app/update.gleam) | Exhaustive message-to-transformation table |
| [src/app/transformations.gleam](src/app/transformations.gleam) | Pure model changes and effect requests |
| [src/app/query.gleam](src/app/query.gleam) | Query construction and preparation with phantom stages |
| [src/app/presentation.gleam](src/app/presentation.gleam) | Map domain state to display values in a `Screen` record |
| [src/app/view.mjs](src/app/view.mjs) | HTML template values and event handlers that dispatch messages |
| [src/app/effects.gleam](src/app/effects.gleam) | Interpret effects and wrap browser outcomes as messages |
| [src/app/browser_effects.mjs](src/app/browser_effects.mjs) | Fetch, response validation, safe links, and local storage |
| [src/valuz/browser.gleam](src/valuz/browser.gleam) | Typed browser configuration and runtime assembly |
| [src/valuz/browser_ffi.mjs](src/valuz/browser_ffi.mjs) | Mount to the DOM, render with lit-html, and dispose |
| [src/valuz/runtime.gleam](src/valuz/runtime.gleam) | Retain the model and process application turns in order |
| [src/valuz/runtime_ffi.mjs](src/valuz/runtime_ffi.mjs) | Mutable reference storage and exception cleanup |

`index.html` is the static page shell, including `<div id="app">`. `style.css` supplies styling. [entry.mjs](entry.mjs) starts the compiled Gleam program. Generated files live under `build/` and `dist/`; edit the source files instead.

## Startup and rendering

`index.html` loads `dist/app.js`. The bundle includes `entry.mjs`, which calls Gleam's `main()`.

`main` supplies one named configuration:

```gleam
browser.start(browser.Config(
  initial: model.initial(),
  update: update.update,
  presentation: presentation.describe,
  view: view,
  perform: effects.perform,
  target: "app",
))
```

`valuz/browser.gleam` connects these functions to the generic runtime. The browser host finds the target element, connects message dispatch, and calls `runtime.refresh()` to publish the initial state.

The rendering path is:

```text
Model → presentation.describe → Screen → view.mjs → Template → lit-html render
```

Presentation handles domain alternatives exhaustively in Gleam: ready, searching, successful, empty, or failed. Its `Screen` contains the draft, search heading, search detail, story links, and storage feedback. The JavaScript view places those values in markup.

The view uses **standalone lit-html from Lit**, rather than Lit components or a second application runtime. Building a template produces a value; `render` interprets it in the DOM. There are no signals watching the model. Every processed message explicitly publishes the next view, and lit-html updates the changing template parts.

Template event handlers construct compiled Gleam messages directly. For example:

```js
@click=${() => dispatch(new UserRequestedDraftSave())}
```

The collapsible model inspector is part of the view. It formats current state, including Gleam constructor names, without adding history or debugging fields to the model.

## Follow a search

1. Editing the input wraps its text with `query.from_input` and dispatches `UserEditedDraftQuery`. Its transformation updates the draft without requesting an effect.
2. Submitting the form dispatches `UserSubmittedSearch`. `begin_search()` returns an operation; the runtime applies it to the current model.
3. Query preparation trims the draft and rejects blank input. A valid query creates a `Searching` state and a `SearchService` effect with the same request ID. The draft itself stays unchanged.
4. The runtime retains that state and renders “Searching…” before starting the effect.
5. `effects.perform` interprets `SearchService`. JavaScript fetches stories, checks HTTP status, parses JSON, validates it with Valibot, and constructs Gleam story values.
6. The callback dispatches `HttpReturnedSearchResult` with the request ID and either stories or a failure reason.
7. The response transformation accepts the outcome only if its ID still matches the active search. An older result cannot replace newer results. The runtime retains and renders the accepted state.

Each request has its own 12-second abort deadline, cleared after success or failure. Ignoring an obsolete response does not cancel its network request.

## What the runtime guarantees

The runtime's configuration consists of `initial`, `update`, `view`, `present`, and `perform`. It does not know application message constructors, search rules, DOM IDs, or storage keys.

| Function | Job |
|---|---|
| `create` | Store the initial state and return `dispatch`, `refresh`, and `stop` |
| `dispatch` | Queue a message and request processing |
| `run` | Guard against nested processing; release the guard even after an exception |
| `drain` | Process queued messages in arrival order |
| `apply_message` | Apply a decision, retain its model, publish, then hand off effects |
| `publish` | Derive the view description and call the presenter |
| `perform_effects` | Start effects in list order, stopping if the runtime is stopped |

`refresh` is a function stored in the returned `Runtime` record, not a separate named function. It publishes current state without applying an update. `stop` clears queued messages and ignores future dispatches and refreshes.

The queue matters even with synchronous APIs. Saving to local storage can dispatch its result immediately. That result waits until the current turn finishes instead of interrupting it. Two internal lists, `waiting` and `incoming`, implement one FIFO queue without repeatedly appending to immutable lists.

The runtime is effectful: it changes a reference containing the current model and coordination state. Individual application transformations remain pure. The JavaScript helper supplies only `reference`, `read`, `write`, and `with_cleanup`.

An unexpected rendering or adapter exception still escapes. The model may already have been retained and some external work may already have started. Releasing the processing guard is not transaction rollback or an automatic recovery policy. Stopping ignores late outcomes; it does not automatically cancel pending requests. Subscriptions, observation hooks, persistent history, and replay are not implemented in the current runtime.

## Gleam and JavaScript at the boundary

Gleam's external declarations specify the JavaScript module, export, and expected types. In `main.gleam`, the view binding is:

```gleam
@external(javascript, "./app/view.mjs", "appView")
fn view(
  screen: Screen,
  model: Model,
  dispatch: fn(Message) -> Nil,
) -> browser.Template
```

The same mechanism connects `effects.gleam` to `browser_effects.mjs`. The compiler checks Gleam callers against the declaration; it does not verify the JavaScript implementation. Integration tests cover that boundary.

JavaScript imports generated Gleam constructors to produce the values those callbacks expect. Named record fields become named JavaScript properties; unnamed wrapper payloads use positional properties. Gleam lists cross the boundary using `toList` and `.toArray()`.

Paths such as `../gleam.mjs` in `view.mjs` refer to the **compiled layout**. Gleam copies the JavaScript source into `build/dev/javascript/values_browser_lab/app/`, beside the generated application modules. The compiler-generated `gleam.mjs` one directory above supplies helpers such as `CustomType`. Run the app through its build, not by importing these source files directly.

`browser_effects.mjs` uses Ramda for function composition and branching, promises for asynchronous work, and Valibot for response validation. Ramda is this application's implementation preference, not a Valuz requirement. Storage callbacks run outside exception handling so an application callback bug is not misreported as a failed storage operation.

## Implement an application or feature

For another application, keep `src/valuz/` and replace the application modules and `main` configuration. Supply:

- An initial model with explicit states.
- An update function selecting pure model-to-model-and-effects transformations.
- A presentation function producing display values.
- A JavaScript template function accepting those values, the model, and dispatch.
- A performer that turns effect descriptions into external work and dispatches outcomes.
- A matching HTML mount target and an FFI declaration for the view.

These file boundaries are conventions that make responsibilities visible. The runtime requires the function contracts, not particular application filenames.

When adding a feature, begin with its messages and state, then route the messages to transformations. Add effect descriptions only when external work is needed. Handle every outcome explicitly, update presentation, and bind the control to its message in the template.

For example, a **Clear results** feature needs no external effect. Add `UserRequestedSearchClear` to `Message`, then add this transformation, using the existing imports in `transformations.gleam`:

```gleam
pub fn clear_search() -> Operation {
  fn(model: model.Model) {
    #(Model(..model, search_state: SearchReady), [])
  }
}
```

Import that message constructor in `update.gleam` and route it:

```gleam
UserRequestedSearchClear -> transformations.clear_search()
```

Finally import the compiled constructor in `view.mjs` and add a button:

```js
html`<button @click=${() => dispatch(new UserRequestedSearchClear())}>
  Clear results
</button>`
```

Presentation already knows how to display `SearchReady`. Returning to that state also makes a pending result obsolete, because response handling requires a matching `Searching` state. This is an example extension, not a control currently in the app.

The compiler flags an unhandled message in the exhaustive update table. It cannot prove the intended behavior or check handwritten JavaScript wiring. Test meaningful policies such as preserving the draft and ignoring an old result after clearing, then run `npm run check`.

### Query stages

The example's opaque `Query(stage)` uses constructorless phantom labels `Unchecked` and `Searchable`. The input creates `Query(Unchecked)`. Preparation trims and checks it, returning either `EmptyQuery` or `Query(Searchable)`. `SearchService` requires the prepared stage.

The compiler preserves that distinction after validation. The stage adds no runtime payload, so the inspector shows `Query`, not its stage. This pattern is useful when an API should require an earlier preparation step; it does not validate input automatically or replace ordinary runtime checks.

## Scope

Valuz is a local experiment, not a published package or a full application framework. Browser Lab currently demonstrates search, stale-response handling, synchronous storage outcomes, and a small model inspector. The reusable browser starter chooses lit-html; the lower-level runtime accepts supplied view and presenter functions. No CLI host or subscription system is maintained here.
