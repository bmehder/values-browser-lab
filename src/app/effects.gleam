import app/model.{
  type Effect, type Message, type Story, ClipboardReturnedWriteResult,
  ClockReading, ClockReturnedTime, CopyText, FailureReason,
  HttpReturnedSearchResult, Milliseconds, ReadDraft, ReadTime, SaveDraft,
  SearchService, StartTimer, StorageReturnedReadResult,
  StorageReturnedSaveResult, TimerElapsed,
}
import app/query

// This interpreter is the only place an Effect becomes an operation.
// Adapters report outcomes; update decides how those outcomes affect the model.
pub fn perform(effect: Effect, dispatch: fn(Message) -> Nil) -> Nil {
  case effect {
    SearchService(id, prepared_query) ->
      search(
        query.to_string(prepared_query),
        fn(stories) {
          stories
          |> Ok
          |> HttpReturnedSearchResult(id, _)
          |> dispatch
        },
        fn(reason) {
          reason
          |> FailureReason
          |> Error
          |> HttpReturnedSearchResult(id, _)
          |> dispatch
        },
      )
    ReadTime ->
      now()
      |> ClockReading
      |> ClockReturnedTime
      |> dispatch
    SaveDraft(draft) ->
      save(
        query.to_string(draft),
        fn() {
          Ok(Nil)
          |> StorageReturnedSaveResult
          |> dispatch
        },
        fn(reason) {
          reason
          |> FailureReason
          |> Error
          |> StorageReturnedSaveResult
          |> dispatch
        },
      )
    ReadDraft ->
      restore(
        fn(text) {
          text
          |> query.from_input
          |> Ok
          |> StorageReturnedReadResult
          |> dispatch
        },
        fn(reason) {
          reason
          |> FailureReason
          |> Error
          |> StorageReturnedReadResult
          |> dispatch
        },
      )
    CopyText(draft) ->
      copy(
        query.to_string(draft),
        fn() {
          Ok(Nil)
          |> ClipboardReturnedWriteResult
          |> dispatch
        },
        fn(reason) {
          reason
          |> FailureReason
          |> Error
          |> ClipboardReturnedWriteResult
          |> dispatch
        },
      )
    StartTimer(id, Milliseconds(milliseconds)) ->
      delay(milliseconds, fn() { dispatch(TimerElapsed(id)) })
  }
}

@external(javascript, "./browser.mjs", "search")
fn search(
  query: String,
  success: fn(List(Story)) -> Nil,
  failure: fn(String) -> Nil,
) -> Nil

@external(javascript, "./browser.mjs", "now")
fn now() -> String

@external(javascript, "./browser.mjs", "save")
fn save(text: String, success: fn() -> Nil, failure: fn(String) -> Nil) -> Nil

@external(javascript, "./browser.mjs", "restore")
fn restore(success: fn(String) -> Nil, failure: fn(String) -> Nil) -> Nil

@external(javascript, "./browser.mjs", "copy")
fn copy(text: String, success: fn() -> Nil, failure: fn(String) -> Nil) -> Nil

@external(javascript, "./browser.mjs", "delay")
fn delay(milliseconds: Int, finished: fn() -> Nil) -> Nil
