# Valuz Browser Lab — quick reference

Use this page to find a responsibility or recall a term. Use the [full guide](guide.md) for explanations and walkthroughs.

Valuz is a small MVU runtime. `src/valuz/` is reusable; `src/app/` is Browser Lab; `src/main.gleam` wires the application together.

## One turn

```text
Message → update → Operation
                      |
                 apply(Model)
                      |
              Next Model + Effects
                      |
              retain Next Model
                      |
          render + reconcile + perform
                                     |
                               outcome Message
```

The operation describes a pure state transition. The effect describes requested browser work. The coordinator runs the transition, commits the next model, then interprets the effects.

## Files

| Need | File |
|---|---|
| Named types and states | [model.gleam](../src/app/model.gleam) |
| Opaque query constructor and preparation | [query.gleam](../src/app/query.gleam) |
| Message-to-operation table | [domain.gleam](../src/app/domain.gleam) |
| Transition policy | [operations.gleam](../src/app/operations.gleam) |
| Screen wording and subscription description | [presentation.gleam](../src/app/presentation.gleam) |
| Gleam effect interpreter | [effects.gleam](../src/app/effects.gleam) |
| Browser operations, decoding, and result callbacks | [browser.mjs](../src/app/browser.mjs) |
| Browser rendering and live-clock lifecycle | [app.mjs](../src/app/app.mjs) |
| All panel templates and message-producing event bindings | [view.mjs](../src/app/view.mjs) |
| Generic queue, current model, and adapter calls | [runtime.gleam](../src/valuz/runtime.gleam) |
| Reference storage and exception cleanup | [runtime_ffi.mjs](../src/valuz/runtime_ffi.mjs) |
| Wiring and DOM message constructors | [main.gleam](../src/main.gleam) |
| Call main from the bundle | [entry.mjs](../entry.mjs) |

## Phantom query stages

```text
String → from_input → Query(Unchecked)
                              |
                           prepare
                              |
             Error(EmptyQuery) or Ok(Query(Searchable))
```

- `DraftQuery` aliases `Query(Unchecked)`.
- `SearchQuery` aliases `Query(Searchable)`.
- `SearchService` requires the searchable stage.
- `prepare` trims and checks; the compiler preserves the distinction afterward.
- `opaque` hides the constructor from other Gleam modules.
- `to_string` reads either stage without changing it.
- `pub type Unchecked` and `pub type Searchable` declare the labels without constructors.
- The stage is not stored in the runtime value. The string wrapper still exists.
- A type annotation cannot validate or promote an unchecked query.

## JavaScript boundary

The browser effects use plain functions, async/await, and local try/catch. Valibot validates external response data. lit-html renders the template values built by `view.mjs`. The coordinator in `runtime.gleam` knows neither library.

| Expression | Meaning |
|---|---|
| `await fetch(url)` | Wait for a response while the browser remains responsive |
| `response.ok` | Whether the HTTP status indicates success |
| `v.parse(schema, body)` | Validate external data or throw a validation error |
| `.then(success, failure)` | Report outcomes through sibling handlers |
| `finally` | Release the request's timeout on either outcome |
| `toList(stories)` | Convert a JavaScript array to a Gleam list |

Inspect archived files without changing the working tree with `git show archive/functional-javascript:src/task.mjs`.

## Request/result pairs

| Request message | Effect | Outcome message |
|---|---|---|
| `UserSubmittedSearch` | `SearchService` | `HttpReturnedSearchResult` |
| `UserRequestedDraftSave` | `SaveDraft` | `StorageReturnedSaveResult` |
| `UserRequestedDraftRestore` | `ReadDraft` | `StorageReturnedReadResult` |

`UserRequestedLiveClockToggle` changes clock mode. The derived `EverySecond` subscription starts or stops the interval, whose events become `ClockTicked` messages.

## Remember the limits

- Ignoring an old result is not cancellation.
- Calling a browser adapter starts the operation; the Gleam effect value describes it before that call.
- The query API enforces nonblank, trimmed queries, not general security properties.
- The current subscription reconciler supports one source.
- Browser adapters remain the trusted untyped boundary.

## Commands

```sh
cd ~/Developer/Gleam/values-browser-lab
npm start       # Build, then serve at http://127.0.0.1:8000
npm run build   # Rebuild after edits; refresh the browser afterward
npm run check   # Format check, tests, build
```

Stop the server with Ctrl+C. Change the port in `package.json`. Install dependencies on a fresh checkout with `npm install` and `gleam deps download`.

## Runtime adapters

`runtime.create(Config(...))` returns a typed `Runtime` containing `dispatch`, `refresh`, and `stop`. The configuration supplies `initial`, `update`, `view`, `subscriptions`, `present`, `reconcile`, `perform`, and `observe`; pass a no-op function for `observe` when it is unused. The coordinator is generic over the model, messages, effects, subscriptions, and view description. [runtime_ffi.mjs](../src/valuz/runtime_ffi.mjs) supplies only reference storage and exception cleanup. Call `refresh()` after constructing the host to publish the initial state. `reconcile(descriptions, dispatch)` owns subscription interpretation; `perform(effect, dispatch)` owns effect interpretation. Neither DOM IDs nor lit-html are known by the coordinator.

`app.mjs` composes the supplied Gleam model-to-Screen projection with `appView`, then passes the resulting template to `render`. It also owns the live-clock interval and page lifecycle listeners. Its `dispose()` stops the runtime, clears the interval, removes those listeners, and clears the rendered root.

## Current-model inspector

The collapsible inspector is a view concern. It formats current state with constructor names (`ManualClock`, `LiveClock`, `ClockRead`, and other variants) and updates when the model changes. It stores no history and adds no fields or recording wrapper to the domain.

## Interface templates

[view.mjs](../src/app/view.mjs) describes every dynamic panel using standalone lit-html. Event expressions dispatch messages; input properties and attributes are declarative. The runtime and Gleam transition rules are independent of the renderer. There are no signals or separate DOM-control listener tables.
