import model.{
  type Effect, type Message, type Story, ClipboardReturnedWriteResult,
  ClockReading, ClockReturnedTime, CopyText, FailureReason,
  HttpReturnedSearchResult, Milliseconds, ReadDraft, ReadTime, SaveDraft,
  SearchService, StartTimer, StorageReturnedReadResult,
  StorageReturnedSaveResult, TimerElapsed,
}
import query

// This interpreter is the only place an Effect becomes an operation.
// Adapters report outcomes; update decides how those outcomes affect the model.
pub fn perform(effect: Effect, dispatch: fn(Message) -> Nil) -> Nil {
  case effect {
    SearchService(id, prepared_query) ->
      search(
        query.to_string(prepared_query),
        fn(stories) { dispatch(HttpReturnedSearchResult(id, Ok(stories))) },
        fn(reason) {
          dispatch(HttpReturnedSearchResult(id, Error(FailureReason(reason))))
        },
      )
    ReadTime -> dispatch(ClockReturnedTime(ClockReading(now())))
    SaveDraft(draft) ->
      save(
        query.to_string(draft),
        fn() { dispatch(StorageReturnedSaveResult(Ok(Nil))) },
        fn(reason) {
          dispatch(StorageReturnedSaveResult(Error(FailureReason(reason))))
        },
      )
    ReadDraft ->
      restore(
        fn(text) {
          dispatch(StorageReturnedReadResult(Ok(query.from_input(text))))
        },
        fn(reason) {
          dispatch(StorageReturnedReadResult(Error(FailureReason(reason))))
        },
      )
    CopyText(draft) ->
      copy(
        query.to_string(draft),
        fn() { dispatch(ClipboardReturnedWriteResult(Ok(Nil))) },
        fn(reason) {
          dispatch(ClipboardReturnedWriteResult(Error(FailureReason(reason))))
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
