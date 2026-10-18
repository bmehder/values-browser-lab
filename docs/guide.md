# Understanding Valuz Browser Lab

**Start with the big picture:** [The Value of Values](talk.md) is an extended conference-talk script with ten static diagrams and a journey through one search.

Valuz is a small Gleam runtime for Model–View–Update (MVU) applications. Valuz Browser Lab is the application demonstrating it. Its guiding idea is: **Describe what happens. Compose what happens next.**

This guide explains the runtime and its example application as they exist. It is meant to be read slowly, with the source open beside it, and used again when the details are no longer fresh.

You do not need to understand phantom types or promises before starting. Those ideas are introduced where they become useful.

## Reading paths

**To examine the runtime design:** read [the runtime contract](runtime-contract.md). It traces search, immediate storage responses, and the live clock, and distinguishes current guarantees from missing failure and lifecycle policies.

**To understand the application:** read [the overview](#1-the-whole-application), [the domain](#2-reading-the-gleam-domain), and [the search walkthrough](#5-follow-one-search-through-the-system).

**To understand phantom types:** read [the query chapter](#3-phantom-types-without-the-mystery). Open [query.gleam](../src/app/query.gleam) beside it.

**To understand execution:** read [the JavaScript chapter](#4-reading-the-javascript), then follow the search walkthrough. Open [runtime.gleam](../src/valuz/runtime.gleam) for coordination and [browser.mjs](../src/app/browser.mjs) for browser work.

**To return after a few months:** start with the [quick reference](reference.md), then use the troubleshooting section at the end of this guide.

## 1. The whole application

A user changes something or asks for something. The browser turns that interaction into a message. A message is an ordinary value describing what happened; it does not execute its own behavior.

The application reads that message and selects an operation. An operation is a function value. Applying it to the current model produces a pair: a new model and a list of requested effects.

The coordinator retains the new model, updates the screen, maintains subscriptions, and performs the effects. Outcomes return as new messages.

```text
User interaction or external outcome
                 |
              Message
                 |
        update selects Operation
                 |
Current Model -> Operation -> #(Next Model, List(Effect))
                                    |             |
                                   view         perform
                                    |             |
                                  Screen      Browser APIs
                                                  |
                                             New Message
```

There are three different things here that are easy to call “the update”:

1. **Selecting an operation:** `domain.update(message)`.
2. **Applying that operation:** `operation(current_model)`.
3. **Updating the visible browser page:** `render(view(next_model))`.

Only the third changes the DOM. The first two are pure computation.

### What is the model?

The model is the application's current account of its situation. It remembers the draft query, the search currently being treated as relevant, clock mode and reading, and storage status.

It is not the DOM, a database, or a collection of browser objects. It contains domain values. The coordinator keeps a reference to the current model and replaces that reference with the next model after each turn.

### What is an effect?

`SearchService(request_id, prepared_query)` describes an interaction we want. Constructing that value does not contact a service.

`SaveDraft(draft)` describes a storage write. It does not write anything until `perform` interprets it.

An effect description and an operation are therefore different:

- An **operation** decides the next model and requested effects.
- An **effect** describes requested interaction with the environment.
- **Performing** an effect actually calls the environment.

### Why build this ourselves?

A framework can coordinate this cycle. Here we have written a small coordinator so we can examine the mechanism directly. We have not recreated every feature, optimization, or lifecycle guarantee of a framework.

The purpose is to make the application's decisions independent of that coordination machinery. Its meaning lives mostly in Gleam; a small browser boundary handles execution.

### Valuz concepts versus this implementation

Valuz names the design we are exploring: models and messages, pure operations returning a next model and requested effects, explicit interpretation of those effects, and descriptions of ongoing event sources.

Browser Lab is one application demonstrating that design. Its query rules, Hacker News service, storage key, and interface are application choices.

The browser adapters use plain functions, async/await, native promises, and local error handling. Valibot validates responses and lit-html renders template descriptions. These choices belong to Browser Lab; the Valuz runtime knows neither library.

| Layer | What belongs to it |
|---|---|
| Valuz runtime (`src/valuz/`) | Model retention, FIFO messages, turn ordering, and calls to supplied adapters |
| Browser Lab application (`src/app/`) | Model and message types, pure operations, effect and subscription descriptions, query preparation, and presentation |
| Current JavaScript implementation | Async/await, Valibot response validation, DOM rendering, and browser API bindings |

The browser application uses lit-html for rendering and Valibot for response validation. Neither is a dependency of the generic Valuz runtime. A different adapter would not need to change what the application’s messages mean. We have not yet extracted or published a standalone Valuz package.

### The source boundary

`src/valuz/` contains the reusable runtime: `runtime.gleam` and its small `runtime_ffi.mjs` helper. It imports no application types or browser APIs.

`src/app/` contains Browser Lab's vocabulary, decisions, presentation, templates, and browser adapters. `src/main.gleam` is the entry point that wires the application together. A different application would supply its own model, messages, transitions, view descriptions, and adapters.

### Where each responsibility lives

| File | Question it answers |
|---|---|
| [model.gleam](../src/app/model.gleam) | What kinds of values and situations exist? |
| [query.gleam](../src/app/query.gleam) | What must be established before a query is searchable? |
| [domain.gleam](../src/app/domain.gleam) | Which operation does this message mean? |
| [operations.gleam](../src/app/operations.gleam) | What does that operation decide? |
| [presentation.gleam](../src/app/presentation.gleam) | What should the screen say, and which ongoing events are wanted? |
| [effects.gleam](../src/app/effects.gleam) | Which browser adapter implements this effect? |
| [browser.mjs](../src/app/browser.mjs) | How do browser operations run, validate their results, and report to Gleam? |
| [app.mjs](../src/app/app.mjs) | How are the HTML, DOM events, and live clock connected? |
| [runtime.gleam](../src/valuz/runtime.gleam) | Who holds the model, drains messages, and calls the supplied adapters? |
| [main.gleam](../src/main.gleam) | How are all those functions wired together? |
| [entry.mjs](../entry.mjs) | How does the bundled browser application call `main()`? |

## 2. Reading the Gleam domain

Start with `Message`, `Model`, and `domain.update`. These describe the application's vocabulary and intentions. Follow an operation name when you need its implementation.

### Names preserve distinctions

A draft and a submitted query can have different text. Someone may submit “values” and then type “functions” while waiting. The input should show “functions”; the pending result still belongs to “values”. We preserve those as separate facts.

A search request identifier and a story title have different roles. `SearchRequestId(1)` and `StoryTitle("Values")` name those roles explicitly. A wrapper alone does not validate its contents; the query module provides a stronger, controlled API, explained in the next chapter.

### States replace ambiguous flags

The clock has a named mode:

```gleam
pub type ClockMode {
  ManualClock
  LiveClock
}
```

`LiveClock` requests an ongoing subscription; `ManualClock` requests none. The last reading is stored separately, so stopping the clock doesn't erase its displayed time.

Storage has alternatives such as `SavingDraft`, `DraftSaved`, and `StorageFailed(reason)`. The model remembers meaning. `presentation.view` chooses words such as “Saving…” or “Saved in this browser.” That leaves success and failure available for later styling or other decisions.

### A message says what was observed

`UserRequestedDraftSave` means the user asked to save. It does not claim that storage succeeded.

`StorageReturnedSaveResult(Ok(Nil))` reports success; `StorageReturnedSaveResult(Error(reason))` reports failure. `Nil` means successful completion has no extra payload.

`UserSubmittedSearch` is already an observed action: submitting a form. The service result is a separate event.

This naming makes the dispatch table readable:

```gleam
UserRequestedDraftSave -> operations.save_draft()
StorageReturnedSaveResult(result) -> operations.receive_save_result(result)
```

### Why does update return a function?

Our operation type is:

```gleam
pub type Operation = fn(Model) -> #(Model, List(Effect))
```

Read `#(...)` as a tuple: two values kept together. Read `fn(Model) -> ...` as a function accepting a model and returning that tuple.

`domain.update(message)` returns such a function. It has not applied it yet.

For example, `operations.edit_draft(query)` returns a function that remembers the supplied query. The function accepts its model later. This is a closure: a function that retains access to values from where it was created.

Selecting an operation can capture message information, but it does not capture the current application model. The runtime supplies whichever model is current when it handles that message.

The Gleam coordinator selects an operation, then applies it:

```gleam
let operation = config.update(message)
let #(next_model, effects) = operation(current.model)
```

The first call returns a function. The second applies that function to the current model.

### Inspection stays outside the model

`update` directly returns the chosen operation. There is no activity-recording wrapper and no history field in the model. The runtime applies the operation, retains its returned model, publishes the view and subscriptions, and hands off effects.

The collapsible inspector in `view.mjs` formats the current model without changing it. Its JSON formatter includes Gleam constructor names, so `ManualClock` and `LiveClock` do not both disappear into `{}`. Clock readings update in the open inspector as ticks arrive. This is a view of current state, not a transition log or replay facility.

## 3. Phantom types without the mystery

Open [query.gleam](../src/app/query.gleam). The entire mechanism is small enough to inspect together.

### Begin with the problem

A string can contain anything, including `""` and `"   "`. Calling it `SearchQuery` does not make it suitable for searching if anybody can freely construct `SearchQuery("")`.

We want two facts to be distinguishable:

- We have received text that has not been prepared.
- We have checked and normalized text for searching.

An ordinary pair of opaque types could express this. Phantom types let us express the stages of one abstraction, `Query`, while sharing its representation and common functions.

### Find the parameter that has no stored value

```gleam
pub opaque type Query(stage) {
  Query(String)
}
```

The type has a parameter, `stage`. Its constructor stores a `String`. It does not store a `stage` value.

Compare that with `List(item)`: list elements actually contain values of the parameterized type. Our query contains no `Unchecked` or `Searchable` object. That is what makes this parameter *phantom*.

The parameter exists in the type checker's account of the program. It lets the compiler distinguish `Query(Unchecked)` from `Query(Searchable)` without storing a stage flag in every query. The string wrapper itself still has a runtime representation; only the stage parameter adds no stored data.

### The marker types are names, not status flags

```gleam
pub type Unchecked
pub type Searchable
```

These are constructorless type declarations: they introduce distinct type names without introducing functions or values that construct instances. Gleam also uses this syntax for external types. Here we use it solely for phantom stage labels, without supplying a foreign implementation of marker values.

`Query(Unchecked)` and `Query(Searchable)` can therefore be distinct even though we never construct an `Unchecked` or `Searchable` value. The query stores its string; its phantom parameter refers to a type, not a value. Writing `Searchable` in an annotation does not run validation.

The longer declaration `pub type Unchecked { Unchecked }` would introduce both a type and a same-named constructor. That was unnecessary for this use. The shorter declaration says exactly what we need: a type-level label.

Two protections have different jobs: constructorless markers avoid meaningless marker values, while the **opaque Query constructor and its restricted API** prevent callers from manufacturing searchable queries. Changing the marker syntax does not replace the need for opacity.

### Entry always has one specific stage

```gleam
pub fn from_input(text: String) -> Query(Unchecked) {
  Query(text)
}
```

This function promises exactly `Query(Unchecked)`. It does not return `Query(stage)` with a stage chosen by the caller.

That distinction matters. A generic public constructor returning `Query(stage)` would let callers assert a searchable stage without checking anything. We deliberately do not expose one.

### Preparation is the gate

```gleam
pub fn prepare(
  query: Query(Unchecked),
) -> Result(Query(Searchable), QueryProblem) {
  let Query(text) = query
  case string.trim(text) {
    "" -> Error(EmptyQuery)
    normalized -> Ok(Query(normalized))
  }
}
```

Walk through it:

1. The parameter accepts only an unchecked query.
2. Inside this module, we may unpack the private constructor to read its string.
3. Trimming computes a new string. It does not mutate the original query.
4. Blank text produces a named problem.
5. Nonblank text is wrapped in the searchable result promised by the function's return type.

The runtime performs the trimming and blank check. The phantom type does not magically test the string. The compiler subsequently ensures that callers respect the distinction established by that check.

In other words: **runtime checking establishes the fact; the type system keeps us from forgetting which values have that fact.**

### Why opacity is essential

`opaque` means another Gleam module may refer to the `Query` type but may not directly use its constructor or pattern-match its representation.

Without that boundary, another module could manufacture a `Query(Searchable)` around arbitrary text. Our API is safe because the constructor is private, entry has a fixed stage, and preparation is the only public path to the searchable stage.

The guarantee belongs to the whole API, not just to an unused type parameter.

### Reading works at either stage

```gleam
pub fn to_string(query: Query(stage)) -> String
```

This is a signature excerpt; the implementation unpacks and returns the string. Here, the generic `stage` is appropriate. Reading the text is allowed for either stage. The function does not return a differently tagged query.

Saving and displaying a draft do not require it to be searchable. Submitting it does.

### The model's aliases preserve the domain vocabulary

```gleam
pub type DraftQuery = query.Query(query.Unchecked)
pub type SearchQuery = query.Query(query.Searchable)
```

An alias gives another name to an existing type; it does not create a new distinct type by itself. These two aliases are distinct because their underlying phantom arguments are distinct.

`SearchService` accepts `SearchQuery`. Therefore the following idea is rejected by the compiler:

```gleam
// Deliberately invalid: unchecked input cannot satisfy the effect's query type.
SearchService(SearchRequestId(1), query.from_input("values"))
```

The successful path is:

```gleam
let draft = query.from_input("  values  ")
let assert Ok(searchable) = query.prepare(draft)
let effect = SearchService(SearchRequestId(1), searchable)
```

This snippet illustrates a known valid input. The application uses a `case` rather than asserting that arbitrary user input succeeds.

The original draft still contains surrounding spaces. The prepared query contains `"values"`. They are separate immutable values.

### What we actually guarantee

For normal Gleam callers, a searchable query has passed our preparation API: it is trimmed and nonblank. This does not promise the service will return results, that the network is available, or that the text is suitable for every conceivable purpose. It is not an SQL-escaping or authorization guarantee.

Untyped JavaScript could violate a foreign-function contract. We treat the FFI as a trusted boundary and reconstruct restored and user-entered queries through `from_input`. The compiler's guarantee is not a validation system for arbitrary JavaScript objects.

The query compiler tests check both positive and negative examples. They verify that prepared values compile, unchecked values cannot enter a search effect, annotations cannot turn unchecked input into searchable input, and the constructor cannot be called from another module. They also check that the constructorless stage labels cannot be called as marker constructors.

### When to use this technique again

Use phantom stages when functions should only accept values that have passed through particular steps: prepared requests, validated configuration, or a builder with required fields supplied.

Keep ordinary variants for states that the running application needs to inspect, such as `Searching` or `SearchFailed`. Those states contain runtime information. A phantom label is not a replacement for every state machine.

## 4. Reading the JavaScript

The Gleam coordinator works with four small JavaScript modules. Interface descriptions remain separate from execution:

| File | Responsibility |
|---|---|
| [runtime.gleam](../src/valuz/runtime.gleam) | Hold the current model, queue messages, and call supplied functions in order. |
| [runtime_ffi.mjs](../src/valuz/runtime_ffi.mjs) | Supply mutable reference storage and exception cleanup for the Gleam coordinator. |
| [app.mjs](../src/app/app.mjs) | Connect the existing HTML, user events, model inspector, and live clock. |
| [browser.mjs](../src/app/browser.mjs) | Perform browser work and validate incoming search data. |
| [view.mjs](../src/app/view.mjs) | Describe every application panel as template values, including events and lists. |

### Search and validation

`fetchStories` creates a fresh abort controller and a twelve-second timeout, awaits fetch, checks `response.ok`, reads JSON, and calls `decodeStories`. Its `finally` always clears the timeout. The Valibot `SearchResponse` schema checks that hits have string titles and object IDs, with an optional string or null URL. `decodeStories` builds actual Gleam `Story` values and converts the array with `toList`.

`storyUrl` accepts HTTP/HTTPS URLs and otherwise uses the Hacker News discussion page. It uses a short try/catch around standard URL parsing.

The public search function delivers the result through sibling promise handlers:

```js
export const search = (query, success, failure) =>
  fetchStories(query).then(success, error => failure(searchFailure(error)))
```

A bug thrown by the application's success callback is not caught by its sibling failure handler. The failure handler translates network, timeout, and validation errors into application messages.

### Storage and the live clock

`save` and `restore` are synchronous browser calls with local try/catch blocks. Their callbacks run outside those blocks. An absent saved draft is different from a saved empty string.

`now` formats a Date reading. The live-clock interval belongs to `app.mjs`; its ticks dispatch `ClockTicked` messages. The browser host pauses the interval on pagehide, resumes it on pageshow when requested, and clears it on disposal.

These functions are deliberately ordinary JavaScript. Valibot handles runtime validation; lit-html interprets interface descriptions supplied by `view.mjs`. Neither library determines the application's Gleam decisions. There is no Task abstraction or extra execution vocabulary.

### The saved functional JavaScript experiment

The full earlier project, including its task abstraction, Ramda/Valibot adapter, tests, and documentation, is preserved locally at:

```text
Branch: archive/functional-javascript
Commit: 29bb212
```

You can inspect a file without switching branches or changing your current work:

```sh
git show archive/functional-javascript:src/task.mjs
git show archive/functional-javascript:src/browser_programs.mjs
git show archive/functional-javascript:docs/guide.md
```

That snapshot is a complete reference for the earlier experiment. It was not pushed as part of this simplification. The current branch continues with the simpler JavaScript boundary and the newer Gleam design intact.

## 5. Follow one search through the system

Suppose the input contains `"  values  "`. The current next request ID is 1.

### A. Browser input enters the typed domain

The input listener passes the text to the action created in `main.gleam`:

```gleam
fn(text) { UserEditedDraftQuery(query.from_input(text)) }
```

The message carries an unchecked query. The runtime enqueues it, selects `edit_draft`, and applies that operation. The model now remembers the exact text, including spaces. No search effect is requested.

### B. Submission selects an operation

The form listener prevents the browser's normal page submission and dispatches `UserSubmittedSearch`.

`domain.update` selects `operations.begin_search()`. We now have an operation value, not a running request.

### C. Applying the operation decides the turn

The coordinator applies that function to the current model. `begin_search` calls `query.prepare`.

Preparation returns a searchable `"values"`. The operation returns:

- A next model with `Searching(SearchRequestId(1), prepared_query)`.
- A next search request ID of 2.
- One effect: `SearchService(SearchRequestId(1), prepared_query)`.

The draft is unchanged. The returned pair describes the next state and the requested search.

If preparation had returned `EmptyQuery`, the operation would instead return `SearchReady` with no effect and no consumed request ID. That supersedes any earlier pending search in our application policy.

### D. Retain the state before performing the effect

The runtime replaces its current model with this next model, renders its screen description, and reconciles subscriptions.

Only then does it call `effects.perform`. The waiting screen and the request identity are already part of the current model when any result arrives.

The queue's `processing` guard also protects immediate callbacks. Dispatching while a turn is in progress appends a message; it does not recursively apply another operation halfway through the current turn.

### E. Perform connects the description to the browser

The `SearchService` branch unwraps the query with `query.to_string`. It supplies the search adapter with success and failure functions that remember request ID 1.

The adapter creates a fresh abort controller and deadline, awaits fetch, reads the body, validates it, selects safe links, and converts the successful records to Gleam stories.

The timeout is released when that work settles. On failure, the failure path produces a string explanation which the Gleam callback wraps as `FailureReason`.

### F. The result is another message

The callbacks dispatch either:

```text
HttpReturnedSearchResult(request 1, Ok(stories))
HttpReturnedSearchResult(request 1, Error(reason))
```

These are descriptive sketches, not constructor syntax. The real message carries the named ID and result types.

`update` selects `receive_search_result`. When that operation is applied, it compares the response's request ID with the request the model is currently waiting for.

If request 1 is current, the search becomes `SearchSucceeded` or `SearchFailed`. No further effect is requested. `view` derives the screen and the runtime displays it.

### G. What if request 2 has already started?

The callback does not capture the old model. It captures the request ID and later sends a message. The coordinator supplies its current model when handling that message.

If that model is waiting for request 2, the result for request 1 is ignored. An old failure cannot replace newer success, either.

This is logical supersession, not cancellation. Request 1 may finish and use resources even after it stops being relevant. Its deadline still limits its lifetime.

## 6. Subscriptions and rendering

An effect requests a particular operation. A subscription describes an ongoing source of events that should currently exist.

The pure subscription function returns `[EverySecond]` for `LiveClock`, and `[]` for `ManualClock`.

### The coordinator is independent of the host

[runtime.gleam](../src/valuz/runtime.gleam) exports `create`. Its typed `Config` receives the initial model and ordinary functions: `update`, `view`, `subscriptions`, `present`, `reconcile`, `perform`, and `observe` for model inspection. Supply a no-op observation function when none is needed. The private reference and exception cleanup primitives live in [runtime_ffi.mjs](../src/valuz/runtime_ffi.mjs). It imports no application constructors or browser APIs. Its only mutable state is coordination state: current model, message queue, processing guard, and stop flag.

`refresh()` publishes the initial screen and subscriptions. `dispatch(message)` queues a turn. The runtime retains the returned model before calling presentation, subscription, and effect adapters. Even an immediate callback queues its response until the current turn is finished. `stop()` drops queued work and ignores later messages; platform resources are disposed by the host that created them.

[app.mjs](../src/app/app.mjs) supplies the browser implementations and returns a `dispose()` method that stops the coordinator, cancels the live interval, removes input and lifecycle listeners, and stops screen publication. `main.gleam` chooses this browser entry point through its FFI declaration. The application model and decisions do not import lit-html.

### A view description, then a renderer

The pure Gleam `presentation.view` maps a model to a `Screen` containing words, links, and display choices. [view.mjs](../src/app/view.mjs) maps that projection to a lit-html template, with a small function for each panel. It includes search, the live clock, storage, and a collapsible current-model inspector. The static header, introduction, and explanatory footer remain in `index.html`.

`appView(screen, model, dispatch, actions)` returns a template value. Construction neither creates DOM nodes nor dispatches a message. The model argument supplies the inspector's formatted text; it isn't mutated. Template event handlers dispatch messages when the user interacts.

[app.mjs](../src/app/app.mjs) composes the two mappings and supplies the renderer:

```js
// View and presenter functions supplied to Config:
model => appView(view(model), model, dispatch, actions),
description => render(description, root),
```

Here the inner `view` is the supplied Gleam projection. The function supplied to the coordinator returns a complete interface description, which `present` interprets in one root container. The coordinator has no DOM or template-library knowledge.

Standalone [lit-html](https://lit.dev/docs/libraries/standalone-templates/) handles the dynamic text, input property, attributes, lists, and event listeners described by the templates. There are no manual textContent assignments, element builders, per-field binding tables, or Slank signals in the active app. No Lit component base class or application runtime is involved.

Templates use `.value` for the query, `@input` and `@submit` for search messages, `@click` for control messages. Dynamic text is escaped by the renderer. List updates preserve existing nodes by position; this is not an application-level keyed-identity guarantee. Input focus and the inspector's open state survive unrelated turns.

The browser host still owns the `EverySecond` interval and page lifecycle events. It reuses the interval across unrelated messages, pauses on `pagehide`, and resumes on `pageshow`. Its `dispose()` stops the coordinator, removes lifecycle listeners, cancels the interval, and clears the rendered root. Template controls vanish with that root; late outcomes are ignored by the stopped coordinator.

The integration checks cover every panel, input and story-node retention, text escaping, storage restoration, visible clock mode and reading changes in the inspector, clock lifecycle, and disposal. Happy DOM is test-only and is not bundled with the browser app. This project implements only the browser host; a different renderer remains an adapter choice.

## 7. Returning later: run, inspect, change

### Start and stop

From the project directory:

```sh
npm start
```

This builds the Gleam project, bundles `entry.mjs` and its imports with esbuild, then starts a Python server bound to `127.0.0.1` on port 8000. The port is set in `package.json`, not inferred from how many projects are open.

Open http://127.0.0.1:8000. Stop the server with Ctrl+C in its terminal.

Dependencies are already installed on this computer. For a fresh checkout, run `npm install` and `gleam deps download` first. The recorded toolchain was Gleam 1.18.1 and Node 24; Python 3 is used only for local serving.

This is not a live-reload setup. After source changes, run `npm run build` and refresh the browser. Generated files in `build/` and `dist/` are not source files to edit.

### Verification

```sh
npm run check
```

This checks Gleam formatting, runs the Gleam and JavaScript tests, and builds the browser bundle. At the time of writing there are nine Gleam tests and twenty-two JavaScript tests, including the compiler-contract test. Counts may grow; the commands and test names are the useful reference.

The compiler-contract test builds small probes in an isolated temporary project using already-downloaded dependencies. Compile failure is its expected result for invalid examples. It removes the temporary project afterward.

Pure tests cover draft preservation, normalization, blank submissions, outdated search results, clock subscriptions, and storage outcomes. JavaScript tests cover response validation, link safety, callback delivery, storage failures, timeout cleanup, and the query compiler contract.

These are not a replacement for a real browser check of permissions, network availability, and DOM wiring. The local app was also exercised against the real service and browser APIs during development.

### Where should a change go?

| Desired change | First place to look |
|---|---|
| Reject a new kind of query input | `query.prepare`; add a `QueryProblem` alternative and handle it in the operation |
| Change what blank submission means | `operations.begin_search` |
| Change stale-response policy | `operations.receive_search_result` |
| Change feedback wording | `presentation.view` |
| Change response validation or link selection | `decodeStories` or `storyUrl` in `browser.mjs` |
| Change how HTTP data becomes Gleam values | `browser.mjs` and the relevant FFI declaration |
| Change the search timeout | `search` in `browser.mjs` |
| Add an ongoing browser event source | `Subscription`, the pure subscription function, and runtime reconciliation |
| Add snapshot/replay debugging | Design recording at the runtime boundary; the current inspector stores no history |
| Change the port | The `start` script in `package.json` |

Keep the semantic decision in the domain, the environmental operation in its adapter, and display wording in presentation.

### Troubleshooting by symptom

**The page looks old:** rebuild, then refresh. Inspecting an edited source file does not rebuild `dist/app.js`.

**The port is already in use:** another process is listening on 8000. Stop the server you recognize or deliberately choose another port. Do not kill unrelated system services just because they listen on a port.

**A click does nothing:** inspect the template event handler, action wiring in `main.gleam`, and the browser console. The message probably has not reached the domain yet.

**Search remains pending:** follow its effect through `perform` and the browser adapter. Its deadline is 12 seconds; network or validation failures return a search-failure message.

**The clock mode looks unchanged in the inspector:** refresh after rebuilding. The formatter includes constructor names, distinguishing `ManualClock` from `LiveClock`. The first reading arrives on the next interval tick.

**A result arrives but the search stays unchanged:** compare request IDs. Ignoring an obsolete response is intentional.

**A query type mismatch appears after a refactor:** check whether a `Query(Unchecked)` is being used where `Query(Searchable)` is required. Prepare the query and handle the result. Adding a type annotation is not a conversion.

**A browser error causes two result messages:** check whether a success callback has been moved inside the operation's try/catch. Callback bugs should not be relabeled as external-service failure.

## 8. What to remember

The model describes the current situation. Messages describe observed events and requests. `update` selects a pure operation; applying it produces the next model and requested effects. The runtime retains that model before interpreting those requests.

Phantom query stages preserve a distinction established by preparation. Gleam effect values preserve the distinction between describing browser work and performing it. The straightforward JavaScript adapter implements that work explicitly.

Neither removes execution, runtime validation, or environmental uncertainty. They give those concerns explicit homes.

## Further reading

- [Hayleigh Thompson: Phantom Types in Gleam](https://hayleigh-dot-dev.github.io/blog/phantom-types-in-gleam/): the technique behind our query stages.
- [The original Programming with Values series](https://docklands-ssg.vercel.app/notes/what-is-a-program-really/): the motivation for this experiment.
