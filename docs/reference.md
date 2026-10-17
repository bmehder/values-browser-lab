# Valuz Browser Lab — quick reference

Use this page to find a responsibility or recall a term. Use the [full guide](guide.md) for explanations and walkthroughs.

## One turn

```text
Message → update → Operation
                      |
                 apply(Model)
                      |
              Next Model + Effects
                      |
             record Activity
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
| Named types and states | [model.gleam](../src/model.gleam) |
| Opaque query constructor and preparation | [query.gleam](../src/query.gleam) |
| Message-to-operation table | [domain.gleam](../src/domain.gleam) |
| Transition policy | [operations.gleam](../src/operations.gleam) |
| Screen wording and subscription description | [presentation.gleam](../src/presentation.gleam) |
| Gleam effect interpreter | [effects.gleam](../src/effects.gleam) |
| Browser operations, decoding, and result callbacks | [browser.mjs](../src/browser.mjs) |
| Queue, current model, rendering, and intervals | [runtime.mjs](../src/runtime.mjs) |
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

The current implementation uses expression-bodied functions, native promises, and small Ramda compositions. Valibot validates external response data. Ramda supplies `pipe`, `map`, `ifElse`, `cond`, and synchronous `tryCatch` in small helpers. The task helper remains archived; search and clipboard use promise chains; storage remains synchronous. The earlier complete experiment is saved locally on `archive/functional-javascript` at `29bb212`.

| Expression | Meaning |
|---|---|
| `fetch(url).then(next)` | Start a request and pass its successful result to next |
| `response.ok` | Whether HTTP status indicates success; fetch does not reject all bad statuses |
| `response.json()` | Parse a body; validate its shape afterward |
| `tryCatch` | Handle synchronous exceptions from the wrapped operation |
| `.finally(cleanup)` | Clean up on either outcome |
| `toList(stories)` | Convert a JavaScript array to a Gleam list |
| `success(value)` / `failure(reason)` | Report an external outcome to Gleam |

Inspect archived files without changing the working tree with `git show archive/functional-javascript:src/task.mjs`.

## Request/result pairs

| Request message | Effect | Outcome message |
|---|---|---|
| `UserSubmittedSearch` | `SearchService` | `HttpReturnedSearchResult` |
| `UserRequestedTime` | `ReadTime` | `ClockReturnedTime` |
| `UserRequestedDraftSave` | `SaveDraft` | `StorageReturnedSaveResult` |
| `UserRequestedDraftRestore` | `ReadDraft` | `StorageReturnedReadResult` |
| `UserRequestedQueryCopy` | `CopyText` | `ClipboardReturnedWriteResult` |
| `UserRequestedTimerStart` | `StartTimer` | `TimerElapsed` |

`UserRequestedLiveClockToggle` changes clock mode. The derived `EverySecond` subscription starts or stops the interval, whose events become `ClockTicked` messages.

## Remember the limits

- Ignoring an old result is not cancellation.
- A restarted timer leaves the older timeout running; its identity makes the old completion irrelevant.
- Activity stores messages and requested effects, not complete model snapshots.
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
