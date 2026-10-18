# The runtime contract

*How a decision becomes an interaction, without losing the shape of the program.*

Valuz is a small Gleam runtime for Model–View–Update applications. This document describes the contract between that runtime and an application. It establishes the rules we want, checks the existing code against them, and identifies the decisions still missing. Read it alongside the [talk](talk.md), [guide](guide.md), and [quick reference](reference.md).

**The central rule: finish one application decision before processing another. External work reports messages; it never edits the model.**

That rule does not mean waiting for the network before accepting more input. It means finishing the current transition and handing off its requested work before applying the next queued message.

## What the application supplies

| Input | Contract |
|---|---|
| Initial model | The starting application state |
| Update | `Message → Model → #(Model, List(Effect))` |
| View | `Model → ViewDescription` |
| Subscriptions | `Model → List(SubscriptionDescription)` |
| Presenter | Render a view description |
| Reconciler | Maintain the described subscriptions; report events through dispatch |
| Performer | Start an effect; report outcomes through dispatch |
| Observer | Observe the retained model; supply a no-op when unused |

The generic implementation is in [src/valuz/](../src/valuz/runtime.gleam). The application chooses all model, message, effect, subscription, and view types. Browser Lab's implementations are in `src/app/`; [main.gleam](../src/main.gleam) wires them to the browser host.

Valuz owns turn ordering. The application owns the meaning of each decision and the adapters own external resources. Effects and subscriptions return messages rather than changing the model directly. The coordinator itself is effectful: its model reference changes over time, while each application operation remains pure.

## 1. One turn, precisely

A turn takes the retained model and one message. Its pure calculation is:

```text
Message → Operation
Operation(Current model) → #(Next model, Requested effects)
```

Its execution follows this order:

```text
Take one queued message
          ↓
Choose and apply its operation
          ↓
Retain the next model
          ↓
Derive the interface template and render it
          ↓
Observe the model for inspection
          ↓
Derive and reconcile subscriptions
          ↓
Hand off each requested effect, in list order
          ↓
Process the next queued message, if any
```

The pair is the answer to the decision. The following steps interpret that answer and its derived descriptions. Rendering and subscription management also interact with the environment, even though they are not constructors in this app's `Effect` type.

The effect list contains newly requested work for this turn. It is not the inventory of everything still running. The model retains the identities and states needed to decide which later results matter.

**Current code:** [runtime.gleam](../src/valuz/runtime.gleam) follows this order when its supplied functions return normally. It stores the next model before calling `publish`, then invokes `perform` for each returned effect. `publish` calls `present(view(model))`, `observe(model)`, and `reconcile(subscriptions(model), dispatch)` in that order.

“Retain” means replacing the coordinator's current model reference. It is not a database commit or an atomic transaction across the DOM, timers, storage, and network. Later interpretation can fail after the new model has been retained.

## 2. Who owns which decision?

| Part | Owns | Does not own |
|---|---|---|
| Model and operations | Application facts, transition rules, request identity, which outcomes remain relevant | DOM nodes, timer handles, network connections |
| Coordinator | Current model reference, FIFO message queue, turn ordering, processing guard | The meaning of a particular message or effect |
| Effect interpreter | Matching an effect description to an implementation and translating reported outcomes into messages | Updating model fields from a callback |
| Browser implementation | API calls, response validation, request timeout cleanup, browser failure messages | Deciding whether an old response replaces a new search |
| Browser wiring | DOM input, screen presentation, live-clock resources, event listener cleanup | Independently maintaining a second application model |

The relevant files are [operations.gleam](../src/app/operations.gleam), [runtime.gleam](../src/valuz/runtime.gleam), [effects.gleam](../src/app/effects.gleam), [browser.mjs](../src/app/browser.mjs), and [app.mjs](../src/app/app.mjs).

The template renderer belongs to presentation. `app.mjs` composes the Gleam model-to-Screen projection with `appView` from `view.mjs`, then supplies `render` as the presenter. Template values describe all panel markup and events. It doesn't establish message ordering, request relevance, effect completion, or cleanup ownership.

The coordinator assumes that supplied operations and interpreters respect these boundaries. JavaScript does not enforce the immutability or purity of arbitrary objects and functions passed to it.

## 3. Messages can arrive before their turn

`dispatch(message)` appends a message to the queue. If the coordinator is already processing a turn, dispatch returns without starting a nested transition. Once the current turn has completed its handoffs, the coordinator drains the next message against the model it has retained.

The queue orders messages by enqueue order. It does not reorder network responses into request order. Deciding that an older request is obsolete belongs to the application's response operation.

A subsequent application turn may run in the same JavaScript call stack. The queue is a logical ordering mechanism, not a promise to yield to the browser between turns. An asynchronous result arrives later through the event loop, but an immediate callback can already be waiting in the queue.

**Current code:** the `processing` guard prevents nested draining. The tail-recursive `drain` function continues until the queue is empty or the coordinator is stopped. This behavior is covered by the coordinator tests.

**Limit:** there is no scheduling budget or backpressure policy. An unbounded chain of immediate responses could keep draining without giving the browser a chance to render. We should decide whether this experiment needs bounded work per event-loop turn before introducing scheduling machinery.

## 4. Trace: a search remains pending

Assume the draft is “values” and the next search identity is 7. Model details unrelated to searching are omitted below.

| Step | Retained search state | Interpretation and messages |
|---|---|---|
| Receive `UserSubmittedSearch` | The previous state | The message is queued, then selected for a turn. |
| Apply `begin_search()` | Still the previous state during calculation | The operation prepares the draft and returns `Searching(7, query)` with `[SearchService(7, query)]`, advancing the next identity. |
| Retain the answer | `Searching(7, query)` | Presentation shows the waiting state; subscriptions are reconciled. |
| Perform the description | `Searching(7, query)` | The interpreter starts the request. It supplies callbacks carrying identity 7, not a captured model. |
| Handoff finishes | `Searching(7, query)` | The turn ends. The coordinator does not await the request's promise. |
| User edits or submits again | Whatever those newer turns establish | Those messages are processed while request 7 remains pending. |
| Request 7 reports an outcome | The state current at arrival | A callback dispatches `HttpReturnedSearchResult(7, result)`. |
| Apply the response operation | A matching success/failure state, or the existing state | The operation accepts the result only if the current search is still waiting for identity 7. |

The browser adapter checks the HTTP status, validates the response with Valibot, constructs Gleam values, and clears the request's timeout on success or failure. Its completion message takes the same entrance as user input.

Three responsibilities work together:

- The model/effect pair makes the intended state and requested work inspectable as one decision.
- Request matching establishes whether an outcome is still relevant.
- The coordinator ensures the outcome is processed against a retained model, without reentering the current transition.

The pair alone doesn't supply the identity policy. The runtime alone doesn't know that “latest search wins.” The browser's `finally` cleans up that request's timeout; it does not change an application loading flag.

**Current code:** these responsibilities exist. The runtime initiates effects in list order, but their external completion order is unconstrained. Ignoring an old result does not cancel its request.

## 5. Trace: storage answers immediately

Suppose the user requests a draft save. Unlike fetch, `localStorage.setItem` is synchronous.

| Step | Retained storage state | What happens |
|---|---|---|
| Apply `save_draft()` | The previous state during calculation | Return a next model with `SavingDraft` and `[SaveDraft(draft)]`. |
| Retain and publish | `SavingDraft` | The screen description says “Saving…” before the interpreter is called. |
| Perform `SaveDraft` | `SavingDraft` | The browser attempts `localStorage.setItem`. |
| Browser succeeds immediately | `SavingDraft` | Its success callback dispatches `StorageReturnedSaveResult(Ok(Nil))`. The processing guard is still active. |
| Dispatch returns | `SavingDraft` | The result is queued. No nested update runs inside the storage callback. |
| Save handoff returns | `SavingDraft` | Any remaining effects for the current turn are handed off first. |
| Process the queued result | `DraftSaved` | The response operation produces a new model and no effects. The screen is presented again. |

If the browser write fails, the interpreter queues an error result through the same route; the response operation chooses `StorageFailed`.

“Saving…” is presented as an intermediate description. A synchronous result can produce `DraftSaved` before the browser paints a frame, so we do not guarantee that a user will visibly see the waiting state. Model retention and screen publication are different from a screen paint.

This is why handoff order matters even in a single-threaded environment. A callback running immediately must not turn into an unexpected recursive application decision.

**Current code:** this ordering exists. The browser save helper catches the storage operation, then calls success outside that catch. A bug in handling success is not converted into a second, contradictory storage failure.

## 6. Trace: the live clock is an ongoing relationship

A subscription is a description of an input source that should currently exist. It is not another one-shot effect to start afresh every turn.

| Event | Model description | Browser resource |
|---|---|---|
| Initial state | `ManualClock`; subscriptions `[]` | No interval. |
| User enables live mode | `LiveClock`; subscriptions `[EverySecond]` | Start one interval. |
| An unrelated message is processed | Still `[EverySecond]` | Keep the existing interval. Do not start another. |
| The interval ticks | Dispatch `ClockTicked(reading)` | The tick becomes an ordinary queued turn. |
| User disables live mode | `ManualClock`; subscriptions `[]` | Clear the interval. |
| Page hides while live mode remains selected | Model still says `LiveClock` | Pause the interval as a browser lifecycle choice. |
| Page shows again | Model still requests `[EverySecond]` | Resume one interval. |
| Host is disposed | Coordinator stops accepting messages | Remove listeners and clear the interval. |

**Current code:** [app.mjs](../src/app/app.mjs) explicitly recognizes `EverySecond`, owns the interval handle, and pauses/resumes it on page events. The coordinator only supplies subscription descriptions to `reconcile`.

The model records application intent. The host also has lifecycle state: a paused page can still have a model that requests live readings. That distinction needs to stay explicit; a paused interval doesn't mean the user switched clock mode.

An already-arriving tick is harmless to clock state after the user selects manual mode because `receive_clock_tick` checks the current mode. After stop, dispatch ignores the message entirely.

**Limit:** the subscription interpreter supports this one source. Additional sources need their own identity and setup/cleanup rules; the runtime cannot infer those rules from a new constructor alone.

## 7. Startup, refresh, and shutdown

### Startup and refresh

Calling `runtime.create(config)` retains the supplied initial model but doesn't automatically publish it. The browser host obtains the root container, creates the coordinator and page lifecycle listeners, then calls `refresh()`.

Refresh derives the model's Screen projection and interface template, renders it, calls the optional observation function, and reconciles subscriptions without consuming a message, applying an operation, recording activity, or requesting an effect list. An immediate message dispatched during publication is queued and processed after publication finishes. The browser host has no separate initial-render path, so the initial interface is rendered once.

The model inspector is part of the template description. This host supplies a no-op `observe` callback. A custom host can still supply that hook.

Refresh during an active drain is currently ignored. There is no scheduled refresh request. Whether a more general host would need one is an open question.

### Shutdown

`stop()` sets the coordinator's stop flag and drops queued messages. New dispatches and refreshes are ignored. A later effect outcome cannot restart the coordinator.

This is not a rollback. Stop doesn't interrupt a synchronous function that is already executing, undo an external operation, or automatically cancel pending work. The effect loop checks the stop flag before handing off each next effect; publication calls already in progress aren't interrupted.

The browser host's returned `dispose()` also removes its input and page-event listeners and clears its live interval. `pagehide` only pauses that interval so the mount can resume after back/forward navigation; it is not full disposal.

**Limit:** outstanding search requests and one-shot timers are not owned by a cancellation registry. Search has its own timeout; an old timer can fire and have its message ignored. The application currently doesn't expose the host's disposal handle through a public Gleam lifecycle API.

## 8. Failure is not one category

An expected failure from the world belongs in a result message. A bug in our own transition, projection, or interpreter needs a different policy.

| Failure | Current behavior | Contract question |
|---|---|---|
| Network error, bad HTTP status, invalid search data, request timeout | Search adapter reports a failure result message. | Adequate for the current feature. |
| Denied storage or clipboard access | Adapter reports the corresponding failure message. | Adequate for the current feature. |
| Operation throws before returning a pair | The message has been removed from the queue; previous model remains retained. Error escapes. | How do we report the failed turn, and can processing continue? |
| `view`, `present`, `observe`, or `reconcile` throws | New model may already be retained. Later publication steps and requested effects are skipped. Error escapes. | Should presentation or inspection failure prevent requested effects? |
| A synchronous `perform` call throws | Earlier effects may already have started. Later effects aren't invoked by that drain. Error escapes. | Should we stop the application or isolate the failed interpreter? |
| An application callback throws inside a promise handler | It isn't misreported as a service failure; it rejects the returned promise. Runtime doesn't await or supervise it. | Where does that programmer error get reported? |

The processing guard is released through the small FFI helper’s `finally`, even when an adapter throws. That lets a later dispatch start draining again. It does not establish recovery, retry, or consistency after a partially interpreted turn. Already queued messages are retained unless stop clears them; processing them later is not an explicit recovery policy today.

A particularly revealing case: the model enters `SavingDraft`, then rendering throws before `SaveDraft` is handed off. The model describes waiting for work that never started. The pure pair was coherent, but interpretation stopped halfway through its responsibilities.

Likewise, formatting the inspector can fail during template construction and prevent requested effects; a custom observation hook can also fail in the publication path. Debugging output probably shouldn't determine application progress. That is a design judgment we need to make deliberately, not something a small queue solves for us.

We do not currently guarantee exactly-once external work, a result for every request, durable delivery, automatic retries, or transactional execution. A browser operation can be interrupted or report incorrectly; the runtime has no universal completion guard.

## 9. What the existing checks establish

The coordinator tests exercise retained-model ordering, queued immediate responses, initial publication responses, stop behavior, and release of the processing guard after an exception.

The browser-wiring tests exercise messages from DOM input, screen updates through template rendering, unchanged story-node retention, interval reuse, pause/resume, and disposal. Browser-adapter tests exercise response validation, timeout cleanup, failure translation, and separation of callback bugs from operation failures.

Those checks provide evidence for the specific paths above. They don't establish a general fault-supervision or resource-cancellation system. The test that the guard is released proves a mechanism, not that continuing after every exception is safe.

## 10. The missing decisions, in order

**First: decide what a failed interpretation means.** We need a policy for a turn whose model was retained but whose screen, subscription, or effect interpretation failed. A small default might stop further processing and report a fatal runtime error; isolated presentation failure is another possibility. Neither is implemented as a recovery contract today.

**Second: decide which publication responsibilities can block work.** Screen output, model inspection, subscription reconciliation, and effect handoff are currently tied together by call order. Their ordering is intentional, but their failure dependencies need justification. Inspection is the clearest candidate for independent failure handling.

**Third: establish resource ownership before adding cancellation.** The browser wiring owns the live interval and listeners. One-shot operations manage their own immediate resources. If we want host disposal to cancel pending searches and timers, define how interpreters return cancellation handles and what messages, if any, cancellation produces. Don't introduce a general task system just to hide those questions.

A scheduling budget can follow if real message traffic makes it necessary. Another rendering tool can remain an independent choice. Neither resolves the earlier questions.

The useful conclusion is specific: **the coordinator already orders decisions, but it does not yet supervise interpretation.** The Model/Message/Update/Effect design gives us a coherent answer. The next runtime design decision is what happens when carrying out that answer only partly succeeds.
