# Understanding Valuz Browser Lab

Valuz is the emerging framework; Valuz Browser Lab is the application demonstrating it. Its guiding idea is: **Describe what happens. Compose what happens next.**

This guide explains the program as it exists, rather than describing a framework we might eventually build. It is meant to be read slowly, with the source open beside it, and used again when the details are no longer fresh.

You do not need to understand phantom types or promises before starting. Those ideas are introduced where they become useful.

## Reading paths

**To understand the application:** read [the overview](#1-the-whole-application), [the domain](#2-reading-the-gleam-domain), and [the search walkthrough](#5-follow-one-search-through-the-system).

**To understand phantom types:** read [the query chapter](#3-phantom-types-without-the-mystery). Open [query.gleam](../src/query.gleam) beside it.

**To understand the JavaScript:** read [the JavaScript chapter](#4-reading-the-javascript), then follow the search walkthrough. Open [browser.mjs](../src/browser.mjs) and [runtime.mjs](../src/runtime.mjs).

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

The model is the application's current account of its situation. It remembers the draft query, the search currently being treated as relevant, clock mode and reading, operation statuses, timer identity, and recent activity.

It is not the DOM, a database, or a collection of browser objects. It contains domain values. The coordinator keeps a reference to the current model and replaces that reference with the next model after each turn.

### What is an effect?

`SearchService(request_id, prepared_query)` describes an interaction we want. Constructing that value does not contact a service.

`StartTimer(timer_id, Milliseconds(3000))` describes waiting. It does not start a timer until `perform` interprets it.

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

The current JavaScript adapter uses ordinary functions, async/await, and explicit error handling. The earlier Ramda/Valibot/task experiment is preserved in Git. None of those libraries or abstractions is required by Valuz’s design.

| Layer | What belongs to it |
|---|---|
| Valuz's emerging design | Models, messages, operations, effect descriptions, interpretation, and subscriptions |
| Browser Lab application | Query preparation, search policy, clock and timer behavior, presentation |
| Current JavaScript implementation | Async/await, response validation, DOM rendering, and browser API bindings |

The current app has no JavaScript runtime library dependencies; its development tools still build the bundle and documentation. A different adapter would not need to change what the application’s messages mean. We have not yet extracted or published a standalone Valuz package.

### Where each responsibility lives

| File | Question it answers |
|---|---|
| [model.gleam](../src/model.gleam) | What kinds of values and situations exist? |
| [query.gleam](../src/query.gleam) | What must be established before a query is searchable? |
| [domain.gleam](../src/domain.gleam) | Which operation does this message mean? |
| [operations.gleam](../src/operations.gleam) | What does that operation decide? |
| [presentation.gleam](../src/presentation.gleam) | What should the screen say, and which ongoing events are wanted? |
| [effects.gleam](../src/effects.gleam) | Which browser adapter implements this effect? |
| [browser.mjs](../src/browser.mjs) | How do browser operations run, validate their results, and report to Gleam? |
| [runtime.mjs](../src/runtime.mjs) | Who holds the model, drains messages, renders, and manages listeners? |
| [main.gleam](../src/main.gleam) | How are all those functions wired together? |
| [entry.mjs](../entry.mjs) | How does the bundled browser application call `main()`? |

## 2. Reading the Gleam domain

Start with `Message`, `Model`, and `domain.update`. These describe the application's vocabulary and intentions. Follow an operation name when you need its implementation.

### Names preserve distinctions

A draft and a submitted query can have different text. Someone may submit “values” and then type “functions” while waiting. The input should show “functions”; the pending result still belongs to “values”. We preserve those as separate facts.

Similarly, a search request identifier and a timer identifier both use integer representations, but they identify different things. `SearchRequestId(1)` and `TimerId(1)` are different types. Gleam prevents us from casually swapping them.

A wrapper does not automatically validate its contents. `Milliseconds` names a unit; its public constructor alone does not prove a duration is positive. Queries have a stronger, controlled API, explained in the next chapter.

### States replace ambiguous flags

The timer is not a Boolean named `waiting` plus an unrelated status string. It has one of three states:

```gleam
pub type TimerState {
  TimerReady
  TimerRunning(TimerId)
  TimerFinished
}
```

Only `TimerRunning` carries the identity of a pending timer. There is no separate waiting flag that can disagree with that state.

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

The JavaScript coordinator uses:

```js
const [nextModel, effects] = update(queue.shift())(model)
```

Expanded for reading:

```js
const message = queue.shift()
const operation = update(message)
const [nextModel, effects] = operation(model)
```

The compact expression is two function calls. The second calls the function returned by the first.

### Where activity gets recorded

`update` wraps its chosen operation with `record_activity(operation, message)`. That wrapper applies the operation first, then adds an `Activity(message, effects)` entry to its returned model.

The order is:

```text
select operation → apply it → record activity → retain model → render → perform
```

This resembles a tap because it observes a transition at a useful point. It also changes the returned model by adding history, so it is not merely an observer.

We keep at most 18 entries. Each contains the message and requested effects. We do not retain complete before/after snapshots. This is an activity list, not yet a full replay debugger.

## 3. Phantom types without the mystery

Open [query.gleam](../src/query.gleam). The entire mechanism is small enough to inspect together.

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

Saving, copying, and displaying a draft do not require it to be searchable. Submitting it does.

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

The current app uses ordinary JavaScript at its browser boundary. It does not use Ramda, Valibot, or our experimental task abstraction. The earlier implementation is preserved in Git; see [the saved experiment](#the-saved-functional-javascript-experiment).

Start with [browser.mjs](../src/browser.mjs), then read [runtime.mjs](../src/runtime.mjs). The first talks to browser APIs. The second coordinates messages and the screen.

### A small JavaScript reading key

| Expression | Read it as |
|---|---|
| `function search(...) { ... }` | A named function; its body runs when called. |
| `async function search(...)` | A function that returns a promise and may wait with `await`. |
| `const response = await fetch(url)` | Start the request, then continue this function when its promise succeeds. |
| `try { ... } catch (error) { ... }` | Handle exceptions or awaited promise rejections from this block. |
| `finally { clearTimeout(timeout) }` | Clean up after either success or failure. |
| `if (condition) return value` | Choose an outcome and finish the function early. |
| `items.map(toStory)` | Produce an array by transforming every item. |
| `success(value)` | Call the callback provided by Gleam with the successful result. |
| `error?.name` | Read the property if the value is not null or undefined. |

The functions at this boundary perform real work. Calling `search` starts a request. Calling `save` writes storage. Merely importing their definitions does neither.

### Follow the search function from top to bottom

The search function has four phases:

1. Create a fresh abort controller and a timeout for this request.
2. Fetch, check the HTTP status, read JSON, and decode the stories.
3. If an operation fails, report its reason through `failure`.
4. Always clear the timeout; on success, report the stories through `success`.

Its outline is:

```js
export async function search(query, success, failure) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  let stories
  try {
    // Fetch and decode stories here.
  } catch (error) {
    failure(searchFailure(error))
    return
  } finally {
    clearTimeout(timeout)
  }
  success(stories)
}
```

This is a shortened outline, not an alternative implementation. Read the full function in the source.

`await` pauses this asynchronous function, not the browser's entire event loop. While the request is pending, the application can still receive input, render, or start another search.

`fetch` can return a response with an unsuccessful HTTP status without rejecting its promise. We check `response.ok` ourselves. A bad status throws an error that the surrounding catch handles.

`response.json()` can fail too. Successful JSON parsing does not establish the shape of that data, so `decodeStories` checks it next.

### Validate before entering Gleam

The boundary accepts a body only if it contains a `hits` array. Each hit must have a string title and object ID. Its optional URL must be a string, null, or absent. Invalid data throws a useful error, which `search` turns into a failure callback.

Only then do we construct `Story`, `StoryTitle`, and `StoryUrl` values. `toList(stories)` converts the native JavaScript array to the representation expected by Gleam's `List` type. Those are different runtime representations, despite both being collections.

The browser adapter imports the generated constructors from `model.mjs`. That file is produced from `model.gleam`; it is not a second handwritten model.

### Select a usable link

`storyUrl` computes the Hacker News discussion-page fallback first. It then tries to construct a standard `URL` from the provider's address. If the protocol is HTTP or HTTPS, it returns that address. If parsing throws or the protocol is unsuitable, it returns the fallback.

No application-level null sentinel is needed. Null or missing URLs may come from the provider; our helper always returns the chosen string. A `javascript:` or `data:` address cannot become a story link.

### Report outcomes, not callback bugs

The successful callback is deliberately outside the operation's try/catch. A bug in the application's success handler is different from a failed network request. We do not want to dispatch a success, catch a bug in handling it, and then dispatch a second, contradictory failure for that same operation.

The same separation is used for storage and clipboard callbacks. The error callback is called from failure handling; errors it throws are not caught again by another branch of that same handler.

`searchFailure` converts a browser abort into a timeout explanation, uses an available error message, or supplies a fallback message. The Gleam callback wraps that string as `FailureReason` and dispatches the typed result message.

### Storage

`save` calls `localStorage.setItem` in a try/catch. If that operation fails, it calls `failure` and returns. Otherwise it calls `success`.

`restore` reads storage first. It then distinguishes a missing value (`null`) from a saved string. A saved empty string is still a saved draft: it can be restored, even though query preparation will later reject it for searching.

These operations use one application-specific storage key. They do not save the whole model or activity history.

### Clipboard

`copy` gets the clipboard API, checks whether `writeText` exists, then awaits writing. Missing support and denied access have different messages. The successful callback is called only after the browser reports completion.

Clipboard support depends on the browser, secure context, and user interaction. A failure is an expected result the app can display, rather than a reason to stop the message loop.

### Time and timers

`now` constructs a `Date` and formats its local time. It is synchronous: calling it returns a reading immediately. The Gleam interpreter turns that reading into `ClockReturnedTime`.

`delay` calls `setTimeout(finished, milliseconds)`. The supplied callback later creates `TimerElapsed`. Starting a new application timer does not cancel the older browser timeout; the domain checks identities and ignores the obsolete completion.

The ongoing live clock is different: the coordinator owns an interval and removes it when the subscription is no longer wanted.

### What remains functional?

The domain is still made of values and pure operations. The browser functions still have explicit inputs and report outcomes through callbacks. `decodeStories` and link selection remain small transformations separated from network coordination.

The difference is how we express execution at this boundary. We now use familiar control flow rather than a second composition vocabulary. This does not change the meaning of the Gleam messages or require us to abandon the idea that programs can be represented as values.

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

`domain.update` selects `operations.begin_search()`. Its activity wrapper is returned with it. We now have an operation value, not a running request.

### C. Applying the operation decides the turn

The coordinator applies that function to the current model. `begin_search` calls `query.prepare`.

Preparation returns a searchable `"values"`. The operation returns:

- A next model with `Searching(SearchRequestId(1), prepared_query)`.
- A next search request ID of 2.
- One effect: `SearchService(SearchRequestId(1), prepared_query)`.

The draft is unchanged. Activity recording then adds the message and effect to the returned model.

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

If that model is waiting for request 2, the result for request 1 is ignored. An old failure cannot replace newer success, either. The activity list still records that the message arrived, because an ignored result is still an observed event.

This is logical supersession, not cancellation. Request 1 may finish and use resources even after it stops being relevant. Its deadline still limits its lifetime.

## 6. Subscriptions and rendering

An effect requests a particular operation. A subscription describes an ongoing source of events that should currently exist.

The pure subscription function returns `[EverySecond]` for `LiveClock`, and `[]` for `ManualClock`.

The JavaScript runtime compares the requested presence of a clock source with its existing interval handle. It starts an interval when needed, keeps the existing one across unrelated messages, and clears it when no longer wanted. A tick creates a time reading and dispatches `ClockTicked`.

Our reconciler currently tests whether the subscription list is nonempty, because it supports exactly one subscription type. That is a deliberate small-example assumption. Adding resize, keyboard, or online/offline sources requires explicit identities and setup/cleanup for each source; simply adding more constructors is not enough.

The runtime also clears its interval on `pagehide` and reconciles again on `pageshow`.

`presentation.view` returns a `Screen`, not HTML or a virtual DOM. The renderer assigns text to existing elements, creates story links, and updates the activity list. The domain model remains the source of application meaning; the screen is a projection of it.

The current renderer recreates result and activity list elements on each turn. That is adequate for this small experiment, but it is not a production diffing renderer. The live clock will consequently cause rendering work every second while enabled.

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

This checks Gleam formatting, runs the Gleam and JavaScript tests, and builds the browser bundle. At the time of writing there are nine Gleam tests and ten JavaScript tests, including the compiler-contract test. Counts may grow; the commands and test names are the useful reference.

The compiler-contract test builds small probes in an isolated temporary project using already-downloaded dependencies. Compile failure is its expected result for invalid examples. It removes the temporary project afterward.

Pure tests cover draft preservation, normalization, blank submissions, outdated search results, timer restarts, clock subscriptions, and storage outcomes. JavaScript tests cover response validation, link safety, callback delivery, storage, clipboard failures, timeout cleanup, and the query compiler contract.

These are not a replacement for a real browser check of permissions, network availability, and DOM wiring. The local app was also exercised against the real service and browser APIs during development.

### Where should a change go?

| Desired change | First place to look |
|---|---|
| Reject a new kind of query input | `query.prepare`; add a `QueryProblem` alternative and handle it in the operation |
| Change what blank submission means | `operations.begin_search` |
| Change stale-response policy | `operations.receive_search_result` |
| Change the timer duration | `operations.start_timer` |
| Change feedback wording | `presentation.view` |
| Change response validation or link selection | `decodeStories` or `storyUrl` in `browser.mjs` |
| Change how HTTP data becomes Gleam values | `browser.mjs` and the relevant FFI declaration |
| Change the search timeout | `search` in `browser.mjs` |
| Add an ongoing browser event source | `Subscription`, the pure subscription function, and runtime reconciliation |
| Add snapshot/replay debugging | Activity representation and recording, while avoiding recursively nested histories |
| Change the port | The `start` script in `package.json` |

Keep the semantic decision in the domain, the environmental operation in its adapter, and display wording in presentation.

### Troubleshooting by symptom

**The page looks old:** rebuild, then refresh. Inspecting an edited source file does not rebuild `dist/app.js`.

**The port is already in use:** another process is listening on 8000. Stop the server you recognize or deliberately choose another port. Do not kill unrelated system services just because they listen on a port.

**A click produces no activity:** inspect the runtime listener, action wiring in `main.gleam`, and the browser console. The message probably has not reached the domain yet.

**Activity shows the user request but no result:** follow its effect through `perform` and the browser adapter. Search may still be pending; its deadline is 12 seconds. Clipboard policies and storage restrictions can produce legitimate failure outcomes.

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
