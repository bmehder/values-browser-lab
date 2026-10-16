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
| Deferred computations | [task.mjs](../src/task.mjs) |
| Browser program compositions | [browser_programs.mjs](../src/browser_programs.mjs) |
| Gleam/JavaScript result bridge | [browser.mjs](../src/browser.mjs) |
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

## Implementation choices

Ramda and Valibot are libraries used by Browser Lab’s current JavaScript adapter. They are not required parts of Valuz’s architecture. The task helper and DOM renderer are also implementations to study or replace, rather than mandatory framework APIs. The current app still needs its declared dependencies to build.

## JavaScript vocabulary

| Name | Meaning |
|---|---|
| `task(() => work())` | A deferred, reusable computation value |
| `program.run()` | Execute and return a promise |
| `run(program, success, failure)` | Execute and report to Gleam callbacks |
| `program.map(f)` | Transform its successful result with `f` |
| `program.andThen(f)` | On success, build and run the task returned by `f` |
| `program.mapError(f)` | Transform its failure reason; keep it failed |
| `program.ensuring(cleanup)` | Run cleanup after settlement |
| `succeed(value)` | Construct a successful task |
| `fail(reason)` | Construct a failed task |
| `using(acquire, use, release)` | Acquire, use, and release a resource for one execution |
| `pipe(f, g)` | Build a function that runs f, then g |
| `flow(value, [f, g])` | Pass an existing value through f, then g |
| `ifElse(test, yes, no)` | Build a function choosing between two functions |
| `cond([[test, action], ...])` | Build ordered conditional selection |
| `tryCatch(work, recover)` | Convert synchronous exceptions; not later promise rejections |
| `() => value` | A constant-result function, rather than the result itself |

`map` is imported from two places. Ramda maps collections; `mapTask` is our alias for changing a task's eventual result.

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
- A task is lazy, not cached. Running twice performs the work twice.
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
