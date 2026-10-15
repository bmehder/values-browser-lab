# Values / Browser Lab

A runnable Gleam application with its own small browser coordinator. No framework runtime and no API key.

## Run

```sh
cd /Users/bradleymehder/Developer/Gleam/values-browser-lab
npm install
gleam deps download
npm start
```

Open http://127.0.0.1:8027. Stop with Ctrl+C. The first two setup commands are already complete on this computer. After editing code, restart `npm start` (or run `npm run build` with the server still running) and refresh the page.

```sh
npm run check
```

This checks formatting, runs six meaningful state-transition tests, and builds the browser app. Gleam 1.18.1 and Node 24 were used for the initial run.

## Try it

1. Submit a search. The application requests `SearchService`, then receives `HttpReturnedSearch`.
2. Edit the input while a search is pending. Draft input and the submitted query remain separate.
3. Read the clock once. Start the live clock to install an ongoing subscription, then stop it to remove the interval.
4. Save the query, edit it, then restore it. The storage operation is interpreted and its result comes back as a message.
5. Copy the query. Permission or API failures become a result message too.
6. Start the timer, then restart it before it finishes. An older completion cannot finish the newer timer.
7. Watch the activity list and open the model inspector.

Search uses the public Hacker News Algolia API. Only searches you submit go to that service. It needs an internet connection; failures and a 12-second timeout appear in the interface. Saved queries stay in this browser's local storage. Clipboard support depends on the browser; localhost is a secure context for supported browser APIs.

## Read the code in this order

### 1. `src/domain.gleam`

`Model`, `Message`, `Effect`, `Subscription`, and `View` are values. `update` is a pure function:

```gleam
pub fn update(model: Model, message: Message) -> #(Model, List(Effect)) {
  model
  |> decide(message)
  |> record(message)
}
```

`decide` contains application policy. `record` adds the visible activity history. `view` derives a screen description. `subscriptions` says whether the one ongoing event source, `EverySecond`, should be active.

The pipe composes pure transformations within a turn. Messages connect separate turns across time.

### 2. `src/effects.gleam`

`perform` interprets each effect. For example:

```gleam
SearchService(id, query) -> search(query, fn(stories) {
  dispatch(HttpReturnedSearch(id, Ok(stories)))
}, fn(reason) {
  dispatch(HttpReturnedSearch(id, Error(reason)))
})
```

The handler reports the outcome. It does not change the model or decide whether that result is still relevant.

### 3. `src/runtime.mjs`

The coordinator holds the current model and drains an explicit message queue:

```js
const [nextModel, effects] = update(model, queue.shift());
model = nextModel;
render(view(model));
reconcile(subscriptions(model));
for (const effect of effects) perform(effect, dispatch);
```

The `processing` guard makes immediate responses safe: dispatch appends them to the queue instead of re-entering `update`. The returned model has already been retained when the next message is handled.

This JavaScript file is intentionally visible and small: it shows the actual mechanism instead of outsourcing it to a framework. Rendering writes a Gleam `View` record to existing DOM elements using `textContent`. It does not embed untrusted HTML.

### 4. `src/browser.mjs`

The foreign-function adapters call real browser APIs: `fetch`, `Date`, `localStorage`, `navigator.clipboard`, and `setTimeout`. The HTTP adapter checks response shapes and restricts story links to HTTP(S). It turns successful decoded stories into a typed Gleam list.

The subscription adapter in the runtime manages `setInterval` and removes it when the model no longer requests it. This sample has one subscription type; adding another requires extending reconciliation explicitly.

## Design boundaries

- Search request identities prevent obsolete results from replacing the current search. They do not cancel older requests; those requests still complete or time out.
- Timer identities reject old completions. Restarting does not cancel the older browser timer.
- The live clock is off initially; no external search occurs until you submit one.
- `View` is a screen description, not a virtual DOM. The handwritten renderer keeps the experiment small.
- This is a local teaching app. It does not include routing, authentication, persistent application history, or production deployment infrastructure.

## Add a capability

1. Add an `Effect` case describing the request and a `Message` case for its outcome.
2. Return the effect from the appropriate branch of `decide`.
3. Add a branch to `perform` and a browser adapter.
4. Handle the response message in `decide`.
5. Expose a control and extend the screen description if needed.

Keep business decisions in Gleam. Keep environmental operations at the boundary. For an ongoing event source, add a subscription description and its setup/cleanup handling instead of starting a permanent listener from every update.
# values-browser-lab
