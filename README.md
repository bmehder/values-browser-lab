# Values / Browser Lab

A runnable Gleam experiment: meaningful types, messages that select functions, and explicitly interpreted effects. No framework runtime or API key.

## Run

```sh
cd /Users/bradleymehder/Developer/Gleam/values-browser-lab
npm install
gleam deps download
npm start
```

Open http://127.0.0.1:8000. Stop with Ctrl+C. Dependencies are already installed on this computer. After code edits, run `npm run build` and refresh. `npm run check` checks formatting, runs seven tests, and builds the app.

## The important change

```gleam
pub type Operation = fn(Model) -> #(Model, List(Effect))
```

`update` takes a message and returns an operation. Each branch names what that operation means:

```gleam
UserSubmittedSearch -> operations.submit_search()
HttpReturnedSearch(request, result) -> operations.receive_search(request, result)
TimerElapsed(timer) -> operations.finish_timer(timer)
```

An operation is a pure function value. Selecting it does not capture the current model or perform a browser action. The coordinator later applies it to the current model:

```js
const operation = update(queue.shift());
const [nextModel, effects] = operation(model);
model = nextModel;
render(view(model));
reconcile(subscriptions(model));
for (const effect of effects) perform(effect, dispatch);
```

The actual runtime combines the first two lines as `update(queue.shift())(model)`. `update` also wraps the selected operation with a pure activity-recording operation; messages and requested effects stay structured until presentation.

## Read the code

- `src/model.gleam`: The domain vocabulary. `DraftQuery` differs from `SearchQuery`; `SearchRequestId` differs from `TimerId`; durations, clock readings, story titles, URLs, and failure reasons have names. `Model` uses named fields and explicit clock, storage, clipboard, search, and timer states. It has no Boolean flags or feedback strings.
- `src/domain.gleam`: The exhaustive, readable message-to-operation dispatch table. No state transitions, validation, or browser calls in its branches.
- `src/operations.gleam`: The pure operation implementations. Each returns a function. Transitions and obsolete-response policies live here.
- `src/presentation.gleam`: Chooses display text and projects domain values into a `Screen`. Success and failure retain their meaning until this point. Also derives the clock subscription from its mode.
- `src/effects.gleam`: `perform` interprets effect values. It unwraps representations at the foreign-function boundary and wraps external outcomes as typed messages.
- `src/runtime.mjs`: Holds the model, drains the queue, applies operations, renders, and reconciles the live-clock subscription. Immediate responses are enqueued instead of re-entering update.
- `src/browser.mjs`: Real browser operations: HTTP, time, storage, clipboard, and timers. HTTP response shapes and link schemes are checked before typed stories enter the app.
- `src/main.gleam`: Wires the functions together and translates primitive DOM input into domain values.

Named wrappers distinguish meanings; their constructors alone do not validate arbitrary strings or numeric ranges. Input normalization is an operation policy; external response validation belongs at the boundary. Presentation records use strings because they are instructions for the screen, rather than application state.

## Try it

1. Search Hacker News. Edit the input during the request; the submitted search retains its own query. Newer searches supersede older results.
2. Read the clock once, or start and stop its live subscription.
3. Save a query locally, edit it, then restore it.
4. Copy the query. Unavailable or denied clipboard access becomes a failure message.
5. Start and restart the timer. An old timer completion cannot finish the newer timer.
6. Watch the activity history and inspect the model.

Submitted searches go to the public Hacker News search API at Algolia. The app requires an internet connection for search, handles service errors, and times out after 12 seconds. Storage stays in this browser. No search is sent at startup.

## Boundaries

Ignoring an obsolete search does not cancel the older request. Restarting a timer does not cancel its older timeout. The live-clock subscription does remove its interval when stopped. This experiment has one subscription type; another source needs its own explicit reconciliation logic.

The app is a local teaching example with a handwritten screen renderer. It does not include routing, accounts, deployment infrastructure, or a virtual DOM.

## Add an operation

1. Name the domain values and states involved in `model.gleam`.
2. Add a message and a readable branch in `domain.update`.
3. Implement the operation in `operations.gleam`.
4. If the world must be involved, return an effect description, interpret it in `perform`, and route its outcome back as a message.
5. Add presentation and controls where needed.

The pipe composes pure operations within a turn. The message queue connects separate turns across time.
