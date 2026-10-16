# Understanding Valuz Browser Lab

Valuz is the emerging framework; Valuz Browser Lab is the application demonstrating it. Its guiding idea is: **Describe what happens. Compose what happens next.**

This guide explains the program as it exists, rather than describing a framework we might eventually build. It is meant to be read slowly, with the source open beside it, and used again when the details are no longer fresh.

You do not need to understand phantom types, promises, or Ramda before starting. Those ideas are introduced where they become useful.

## Reading paths

**To understand the application:** read [the overview](#1-the-whole-application), [the domain](#2-reading-the-gleam-domain), and [the search walkthrough](#5-follow-one-search-through-the-system).

**To understand phantom types:** read [the query chapter](#3-phantom-types-without-the-mystery). Open [query.gleam](../src/query.gleam) beside it.

**To understand the JavaScript:** read [the task chapter](#4-reading-the-javascript), then follow the search walkthrough. Open [task.mjs](../src/task.mjs) and [browser_programs.mjs](../src/browser_programs.mjs).

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

Ramda and Valibot are choices in **this example's JavaScript adapter**. They are not architectural parts of Valuz, required framework APIs, or conditions for following the design. Another adapter could use other libraries, ordinary JavaScript functions, or a different runtime entirely.

| Layer | What belongs to it |
|---|---|
| Valuz's emerging design | Models, messages, operations, effect descriptions, interpretation, and subscriptions |
| Browser Lab application | Query preparation, search policy, clock and timer behavior, presentation |
| Current JavaScript implementation | Ramda composition, Valibot schemas, the small task helper, DOM renderer, and browser API bindings |

The current repository needs its listed dependencies to build this implementation. Replacing them would require adapting the JavaScript, not changing what the application's messages mean. We have not yet extracted or published a standalone Valuz package.

### Where each responsibility lives

| File | Question it answers |
|---|---|
| [model.gleam](../src/model.gleam) | What kinds of values and situations exist? |
| [query.gleam](../src/query.gleam) | What must be established before a query is searchable? |
| [domain.gleam](../src/domain.gleam) | Which operation does this message mean? |
| [operations.gleam](../src/operations.gleam) | What does that operation decide? |
| [presentation.gleam](../src/presentation.gleam) | What should the screen say, and which ongoing events are wanted? |
| [effects.gleam](../src/effects.gleam) | Which browser adapter implements this effect? |
| [task.mjs](../src/task.mjs) | How do we compose deferred work and eventually run it? |
| [browser_programs.mjs](../src/browser_programs.mjs) | What sequence of browser work and transformations is needed? |
| [browser.mjs](../src/browser.mjs) | How are JavaScript outcomes connected to Gleam callbacks? |
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

These files explain the JavaScript implementation chosen for Browser Lab, not a mandatory Valuz stack. There are four JavaScript layers with different jobs. Read them in this order:

1. `task.mjs`: the vocabulary for deferred computations.
2. `browser_programs.mjs`: compositions written in that vocabulary.
3. `browser.mjs`: the bridge to Gleam values and callbacks.
4. `runtime.mjs`: the coordinator and renderer.

The coordinator remains deliberately operational. It has a queue, a loop, and mutable references to current runtime resources. Functional design makes this boundary explicit; it does not mean a browser never executes instructions or maintains resources.

### A small JavaScript reading key

| Expression | Read it as |
|---|---|
| `value => expression` | A function taking `value` and returning the expression. |
| `() => expression` | A function that needs no arguments. The expression waits until it is called. |
| `first => second => expression` | A function returning another function. Supply the arguments in two calls. |
| `({ controller }) => ...` | A function that extracts the `controller` property from its argument. |
| `const { title, url } = story` | Read named properties from an object. |
| `const [model, effects] = pair` | Read positions from an array; compiled Gleam tuples use this representation. |
| `object?.property` | Read the property if the object is not null or undefined. |
| `void expression` | Evaluate it but discard its return value. It does not make work lazy. |
| `Object.freeze(object)` | Prevent changes to the object's own properties. This is shallow. |

Names such as `mapTask` are ordinary import aliases. We rename our task `map` on import so it is visibly different from Ramda's collection `map`.

### Functions and promises are not the same thing

```js
const getResponse = () => fetch(url)
```

Defining this function does not fetch anything. Calling it does.

```js
const responsePromise = fetch(url)
```

Here the request has already started by the time we store the returned promise. A promise represents an eventual outcome, but putting an already-started action into a variable does not defer it.

Our task abstraction keeps the function that starts work, rather than starting work during construction:

```js
const program = task(() => fetch(url))
```

`program` is a reusable, deferred description. It is a JavaScript object containing functions. It is not a serialized instruction tree or an already-running promise.

Calling `program.run()` starts this execution. Running it again starts another execution; there is no automatic caching. It may produce a different result because the outside world can change.

### The heart of task.mjs

```js
const run = () => Promise.resolve().then(computation)
```

`Promise.resolve()` gives us a fulfilled promise. `.then(computation)` schedules the supplied function to run in a promise continuation. Crucially, this line is inside `run`; it does not execute when we create the task.

This mechanism also gives us one error channel:

- A value returned by `computation` becomes the successful result.
- A promise returned by it is awaited by promise resolution.
- An exception it throws becomes a rejection.
- A rejected promise it returns remains a rejection.

The task methods return new tasks. They do not call the outer `run` until the new task is executed.

### map: change a successful result

```js
const program = task(() => 3).map(number => number * 2)
```

The computation hasn't run yet. When it runs, it produces 3, then the mapping function produces 6.

Use `map` when your function returns an ordinary result, not another task. It can turn raw story data into domain stories. It does not run after a failure. If the mapping function throws, the resulting task fails.

Our implementation can be read as:

```text
Create a new task.
When run, execute the previous task.
If it succeeds, transform its result.
```

### andThen: choose the next computation

Suppose reading a response body requires another asynchronous action. The next step must return a task:

```js
program.andThen(response => task(() => response.json()))
```

`andThen` runs the first task, passes its successful value to the supplied function, and runs the task that function returns.

If we used `map` with the same function, the successful result would be a task object. We would have described the next action but not sequenced its execution.

A useful question is: **does this function return an answer, or another computation that will produce an answer?** Use `map` for the first; use `andThen` for the second.

Neither method continues its success path after a rejection.

### mapError: change the failure explanation

```js
program.mapError(() => 'This browser could not save the query.')
```

This replaces a failure reason while leaving the task failed. It is not recovery into success, retrying, or swallowing an error.

The zero-argument arrow is intentional: we do not need the original browser exception to choose this user-facing explanation. Ramda's `always(text)` would also return a constant function, but the arrow keeps this particular intent easy to read.

### succeed and fail

`succeed(value)` constructs a task that will succeed with a known value. `fail(reason)` constructs a task that will fail with a known reason.

Neither executes during construction. These let ordinary decisions return computation values:

```js
const requireSavedDraft = ifElse(
  isNil,
  () => fail('No saved query yet.'),
  succeed,
)
```

If storage returned null or undefined, choose a failure task. Otherwise, choose a successful task carrying the saved text. An empty string is not null: it remains a legitimate saved draft, even though it cannot later be prepared for searching.

### run has two meanings to distinguish

The **method** `program.run()` returns a promise. It is useful for composition and tests, where we can `await` it.

The **exported function** `run(program, success, failure)` is the terminal callback bridge used by Gleam adapters. It runs the task and delivers either outcome to the appropriate callback. It intentionally discards the resulting promise and returns no meaningful value to Gleam.

The bridge uses `.then(success, failure)`. A failure in the program calls `failure`. An exception thrown by the application's success callback is not caught and relabeled as a failed HTTP request. Otherwise one completed interaction could incorrectly dispatch a second result.

This also means application callback bugs are not automatically handled by the task's user-facing error mapping; they can surface as unhandled promise rejections. We want to distinguish our own bugs from failures of the requested browser operation.

### ensuring and using: resources have lifetimes

Search needs an abort controller and a timeout. Those are resources for one execution, not global values shared by every request.

`requestDeadline` is a task value. Each execution creates a fresh controller and schedules a 12-second abort. Merely defining that task starts no timer.

`ensuring(cleanup)` attaches cleanup to both success and failure, using promise `finally`. A throwing or rejecting cleanup can itself fail the computation; cleanup is not assumed infallible in the abstraction. Our search cleanup simply clears a timer.

`using(acquire, use, release)` means:

```text
Acquire a resource.
Use it to build and run a dependent program.
Release it when that program settles.
```

If acquisition fails, there is no successfully acquired resource to release. If building the dependent program throws, the wrapper still releases the resource.

For search, cleanup covers body reading and validation as well as the initial fetch. We clear the timeout on successful completion, HTTP errors, invalid JSON, rejected response shapes, and network failure.

The helper is not a general cancellation system. We use a specific `AbortController` for the network deadline. Tasks themselves expose no cancel method, and `waitProgram` exposes no way to cancel its timeout.

### Ramda in this adapter: read the composition left to right

`pipe(f, g, h)` returns a new function. Calling it with `x` means `h(g(f(x)))`.

```js
const toStories = pipe(map(toStory), toList)
```

First transform each JavaScript story record; then convert the array into a Gleam list. That last conversion matters: a native JavaScript array is not a Gleam `List` just because both are collections.

`flow(value, [f, g, h])` immediately passes an existing value through those functions. In our adapter, that value is usually a task object. Transforming the task object immediately is safe because task composition does not execute the represented work.

This is the crucial distinction:

```text
flow executes the functions that build the composition now.
The resulting task executes the browser operations later.
```

`ifElse(predicate, whenTrue, whenFalse)` returns a function. Both branches must be functions, so we use `() => UnusableUrl` where the result is constant. Only the selected branch is called.

`cond` is an ordered list of predicate/action pairs. `failureMessage` checks an abort error first, then an existing string reason, then an error message, then a fallback. `T` is Ramda's always-true predicate, making the final pair the default.

`prop('href')` is a function that reads an object's `href` property. In the installed Ramda version, `propEq('UsableUrl', 'kind')` tests whether the `kind` property equals `'UsableUrl'`: the expected value comes first.

These helpers do not eliminate decisions from the computation. They let us represent and compose those decisions as functions.

### Synchronous exceptions versus asynchronous rejection

Ramda's `tryCatch` handles exceptions thrown while a function is being called. Our `new URL(value)` expression can throw immediately, so `tryCatch` fits it.

It does not catch a promise rejecting later. A `fetch` can reject asynchronously; our task's promise chain handles that rejection instead.

Using `tryCatch` around a function returning `fetch(...)` would not, by itself, handle later network failure. The two mechanisms cover different kinds of failure.

### Validation and link selection

Valibot's `SearchResponse` is a schema value. It expects an object with a `hits` array, with a string title and object ID for each hit. The external URL may be a string, null, or absent. Unrelated response fields are discarded by the object schema.

`safeParse` returns a success/failure result. `decodeSearchResponse` selects a success task carrying the hits or a failure task with a useful explanation. One malformed hit rejects the response; we do not silently drop it.

For each validated hit, `webUrl` constructs a standard URL and checks its protocol. It produces one of two named JavaScript outcomes:

```js
UsableUrl(href)
UnusableUrl
```

In the source these are small frozen tagged objects. They are not Gleam types and JavaScript does not check exhaustive handling of them. `storyUrl` selects the supplied HTTP(S) address or the Hacker News discussion link.

This is why an unsafe `javascript:` URL cannot become a clickable story link. The fallback also covers missing and malformed URLs. The provider's null is accepted at the data boundary; our own selection uses named outcomes rather than an ambiguous null sentinel.

### Reading the compact search expression

The returned task passes through:

```js
flow(task(() => fetch(url, options)), [
  andThen(acceptResponse),
  andThen(response => task(() => response.json())),
  andThen(decodeSearchResponse),
  mapTask(map(storyData)),
])
```

This excerpt names `url` and `options` for clarity; the source constructs them from the query and controller.

The values along the way are:

| Step | Successful result |
|---|---|
| Fetch | Browser `Response` |
| Accept HTTP status | The same response, if its status is successful |
| Read JSON | Parsed but still untrusted JavaScript data |
| Decode schema | A validated array of hits |
| Map story data | An array of safe link/title records |
| Bridge to Gleam | `List(Story)` with named title and URL wrappers |

`mapTask(map(storyData))` has two levels: the outer mapping changes the eventual task result; the inner mapping changes each element of its successful array.

`query => ({ controller }) => ...` likewise has two stages. Supply a query first to obtain a resource-using function. `using` later supplies the controller it acquired for that execution.

### Other browser programs

**Save:** defer `localStorage.setItem`, then map exceptions into a storage failure explanation.

**Restore:** defer reading storage, map access exceptions, then check whether a saved value exists. The order is intentional: “no saved query” remains different from “the browser could not read storage.”

**Copy:** defer obtaining the clipboard object, check that `writeText` exists, then defer writing. Missing support and denied access have distinct explanations. The real browser test confirms copying works from the button interaction in the tested browser; browser policies can differ.

**Wait:** defer constructing a promise whose timer will resolve later. Creating `waitProgram(milliseconds)` does not start the timeout.

**Clock:** `now` is a composed synchronous function because our existing clock protocol expects a reading directly. Defining it does not read the clock; calling it does. It is not a task. Live-clock reads happen in the subscription callback.

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

The adapter constructs `searchProgram(text).map(toStories)`, then passes it to `run`. Task execution acquires a fresh deadline, calls fetch, reads the body, validates it, selects safe links, and converts the successful records to Gleam stories.

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

This checks Gleam formatting, runs the Gleam and JavaScript tests, and builds the browser bundle. At the time of writing there are nine Gleam tests and thirteen JavaScript tests, including the compiler-contract test. Counts may grow; the commands and test names are the useful reference.

The compiler-contract test builds small probes in an isolated temporary project using already-downloaded dependencies. Compile failure is its expected result for invalid examples. It removes the temporary project afterward.

Pure tests cover draft preservation, normalization, blank submissions, outdated search results, timer restarts, clock subscriptions, and storage outcomes. JavaScript tests cover laziness, error conversion, validation, link safety, storage, clipboard failures, and resource cleanup.

These are not a replacement for a real browser check of permissions, network availability, and DOM wiring. The local app was also exercised against the real service and browser APIs during development.

### Where should a change go?

| Desired change | First place to look |
|---|---|
| Reject a new kind of query input | `query.prepare`; add a `QueryProblem` alternative and handle it in the operation |
| Change what blank submission means | `operations.begin_search` |
| Change stale-response policy | `operations.receive_search_result` |
| Change the timer duration | `operations.start_timer` |
| Change feedback wording | `presentation.view` |
| Change HTTP schema or link selection | `browser_programs.mjs` |
| Change how HTTP data becomes Gleam values | `browser.mjs` and the relevant FFI declaration |
| Change the search timeout | `requestDeadline` in `browser_programs.mjs` |
| Add an ongoing browser event source | `Subscription`, the pure subscription function, and runtime reconciliation |
| Add snapshot/replay debugging | Activity representation and recording, while avoiding recursively nested histories |
| Change the port | The `start` script in `package.json` |

Keep the semantic decision in the domain, the environmental operation in its adapter, and display wording in presentation.

### Troubleshooting by symptom

**The page looks old:** rebuild, then refresh. Inspecting an edited source file does not rebuild `dist/app.js`.

**The port is already in use:** another process is listening on 8000. Stop the server you recognize or deliberately choose another port. Do not kill unrelated system services just because they listen on a port.

**A click produces no activity:** inspect the runtime listener, action wiring in `main.gleam`, and the browser console. The message probably has not reached the domain yet.

**Activity shows the user request but no result:** follow its effect through `perform`, the bridge, and the task. Search may still be pending; its deadline is 12 seconds. Clipboard policies and storage restrictions can produce legitimate failure outcomes.

**A result arrives but the search stays unchanged:** compare request IDs. Ignoring an obsolete response is intentional.

**A query type mismatch appears after a refactor:** check whether a `Query(Unchecked)` is being used where `Query(Searchable)` is required. Prepare the query and handle the result. Adding a type annotation is not a conversion.

**A function returns a task object where data was expected:** check `map` versus `andThen`. A result-dependent computation generally needs `andThen`.

**Work starts while building a program:** check whether a browser API was called before entering the thunk. `task(fetch(url))` is wrong; `task(() => fetch(url))` defers the call.

## 8. What to remember

The model describes the current situation. Messages describe observed events and requests. `update` selects a pure operation; applying it produces the next model and requested effects. The runtime retains that model before interpreting those requests.

Phantom query stages preserve a distinction established by preparation. Lazy JavaScript tasks preserve the distinction between describing work and executing it. Both let us move details out of the places where we want to read the program's meaning.

Neither removes execution, runtime validation, or environmental uncertainty. They give those concerns explicit homes.

## Further reading

- [Hayleigh Thompson: Phantom Types in Gleam](https://hayleigh-dot-dev.github.io/blog/phantom-types-in-gleam/): the technique behind our query stages.
- [Ramda API reference](https://ramdajs.com/docs/): especially `pipe`, `flow`, `ifElse`, `cond`, and `tryCatch`.
- [Valibot: parsing data](https://valibot.dev/guides/parse-data/): `safeParse` and schema outcomes.
- [The original Programming with Values series](https://docklands-ssg.vercel.app/notes/what-is-a-program-really/): the motivation for this experiment.
