# Valuz Browser Lab

Valuz is a small runtime for Model–View–Update (MVU) applications. Browser Lab is a working example: search Hacker News and save or restore the draft query in local storage.

The design follows the same broad model, view, and update pattern as [the Elm Architecture](https://guide.elm-lang.org/architecture/). Valuz's browser runtime is written in TypeScript and compiled to JavaScript. In Browser Lab, Gleam handles the application's types and pure decisions and also compiles to JavaScript. JavaScript handles HTML templates and browser APIs through [Gleam's foreign function interface (FFI)](https://gleam.run/documentation/externals/). Elm is the architectural reference; the runtime can also run applications written entirely in JavaScript or TypeScript.

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
npm run typecheck      # Strictly check the TypeScript runtime
npm run build:runtime  # Check and compile runtime.ts to runtime.mjs
npm run build          # Compile the runtime and Gleam, then bundle the app
npm test               # Compile the runtime, then run the test suites
npm run check          # Check formatting, run tests, and build
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

```ts
const transformation = update(message)
const [nextModel, effects] = transformation(model)
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
| [src/valuz/runtime.ts](src/valuz/runtime.ts) | Typed browser runtime: model retention, queue ordering, rendering, effects, and disposal |

`index.html` is the static page shell, including `<div id="app">`. `style.css` supplies styling. [entry.mjs](entry.mjs) starts the compiled Gleam program. The build checks `src/valuz/runtime.ts` with TypeScript, then uses esbuild to generate `src/valuz/runtime.mjs` and its source map for Gleam’s FFI. Those generated files, `build/`, and `dist/` are ignored by Git. Edit `runtime.ts`; builds and tests regenerate its JavaScript automatically. TypeScript is a development dependency; the browser runs JavaScript.

## Startup and rendering

`index.html` loads `dist/app.js`. The bundle includes `entry.mjs`, which calls Gleam's `main()`.

`main` supplies one named configuration:

```gleam
start(Config(
  initial: model.initial(),
  update: update.update,
  view: fn(model, dispatch) {
    view(presentation.describe(model), model, dispatch)
  },
  perform: effects.perform,
  target: "app",
))
```

`main.gleam` declares `start` as an external function bound to `./valuz/runtime.mjs`. The runtime finds the target element, retains the initial model, creates message dispatch, and calls `refresh()` to render the initial state. `start` returns an app handle with `dispatch`, `refresh`, and `dispose`.

The rendering path is:

```text
Model → presentation.describe → Screen → view.mjs → Template → lit-html render
```

Presentation handles domain alternatives exhaustively in Gleam: ready, searching, successful, empty, or failed. Its `Screen` contains the draft, search heading, search detail, story links, and storage feedback. The JavaScript view places those values in markup.

The view uses **standalone lit-html from Lit**, rather than Lit components or a second application runtime. Building a template produces a value; `render` interprets it in the regular DOM inside the target element, where ordinary CSS rules apply. There are no signals watching the model. Every processed message explicitly publishes the next view, and lit-html updates the changing template parts.

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

## The typed runtime contract

[src/valuz/runtime.ts](src/valuz/runtime.ts) contains both the contracts and execution code. Its generic type parameters name the application's model, message, and effect types; Valuz does not define their contents.

```ts
type Dispatch<Message> = (message: Message) => void

type Transformation<Model, Effect> = (
  model: Model,
) => readonly [nextModel: Model, effects: Iterable<Effect>]

type Update<Model, Message, Effect> = (
  message: Message,
) => Transformation<Model, Effect>
```

`Iterable<Effect>` accepts JavaScript arrays and compiled Gleam lists. The labeled tuple keeps the next model and its requested effects together. `View<Model, Message>` accepts a model and dispatch function and returns a lit-html template or simple display value. `Perform<Effect, Message>` accepts one effect and dispatch; it starts external work, whose eventual outcome can return through dispatch.

The configuration has five fields:

| Field | Meaning |
|---|---|
| `initial` | Starting model |
| `update` | Message-to-transformation function |
| `view` | `(model, dispatch) → view description` |
| `perform` | `(effect, dispatch) → external work`; defaults to a no-op for apps without effects |
| `target` | ID of the DOM element to render into |

Browser Lab composes its Gleam presentation function with the JavaScript template function to supply `view`. Presentation is an application choice, rather than a separate runtime hook.

### Reading the execution code

`start` holds one `model`, a `Message[]` queue, and two Boolean flags: `isProcessing` and `isStopped`. The inner functions share that state through closures.

| Function | Job |
|---|---|
| `start` | Find the mount target, create the app, render initial state, and return its controls |
| `dispatch` | Append a message to the queue and request processing |
| `drain` | Guard processing, optionally refresh, and process messages until drained |
| `isDrained` | Check whether the app is stopped or the queue is empty |
| `applyNextMessage` | Remove the oldest message and apply it |
| `applyMessage` | Calculate a decision, retain the next model, render, and hand off effects |
| `renderModel` | Build the view description and pass it to lit-html |
| `performEffects` | Traverse effects using native `forEach`, checking disposal before each handoff |
| `refresh` | Render current state without applying an update |
| `dispose` | Stop processing, clear queued messages, and clear the rendered root |

A local `until` helper performs iterative, stack-safe queue draining. It checks the queue again after each turn, including messages added by immediate effect callbacks. The non-null assertion on `messages.shift()!` reflects that precondition: the helper checks `isDrained` before taking the next message.

The queue matters even with synchronous APIs. A local-storage effect can dispatch its result before its performer returns. `isProcessing` prevents nested draining; the response waits until the current turn finishes. No network request blocks the queue while it waits for a response.

The runtime is effectful: it retains mutable coordination state, renders, and starts effects. Application transformations remain pure. It has no application imports and uses no Ramda dependency; its rendering dependency is lit-html.

An unexpected rendering or adapter exception escapes, and `finally` releases the processing guard. The model may already have been retained and some work may have started; this is not rollback or an automatic recovery policy. Disposal ignores late outcomes but does not cancel pending network requests. Subscriptions, history, and replay are outside the current contract.

## Using Valuz with JavaScript

The runtime accepts ordinary JavaScript functions. After `npm run build:runtime`, a bundled browser entry can import its generated JavaScript:

```js
import { html } from 'lit-html'
import { start } from './src/valuz/runtime.mjs'

const app = start({
  initial: 0,
  update: amount => count => [count + amount, []],
  view: (count, dispatch) => html`
    <button @click=${() => dispatch(1)}>Count: ${count}</button>
  `,
  target: 'app',
})
```

Provide `<div id="app"></div>` in the page. The initial view renders automatically. Messages can also enter through `app.dispatch(message)`; `app.refresh()` republishes current state and `app.dispose()` shuts the app down. This counter needs no effect performer because its transformations return empty effect arrays.

TypeScript applications can import `Config`, `Dispatch`, `Transformation`, `Update`, `View`, `Perform`, and `App` from `runtime.ts` for explicit contracts. The runtime does not require Gleam models or message constructors.

## Gleam and JavaScript at the boundary

Gleam's external declarations specify the JavaScript module, export, and expected types. In `main.gleam`, the view binding is:

```gleam
@external(javascript, "./app/view.mjs", "appView")
fn view(
  screen: Screen,
  model: Model,
  dispatch: fn(Message) -> Nil,
) -> Template
```

The runtime binding is `@external(javascript, "./valuz/runtime.mjs", "start")`. The named Gleam `Config` record exposes properties matching the TypeScript configuration. The same mechanism connects `effects.gleam` to `browser_effects.mjs`. The compiler checks Gleam callers against the declaration; it does not verify the JavaScript implementation. Integration tests cover that boundary.

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

Valuz is a local experiment, not a published package or a full application framework. Browser Lab currently demonstrates search, stale-response handling, synchronous storage outcomes, and a small model inspector. The single-file runtime uses lit-html and accepts supplied update, view, and effect functions. No CLI host or subscription system is maintained here.
