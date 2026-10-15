import model.{
  type Effect, type Message, type Story, ClipboardFinished, ClockReading,
  ClockReturnedTime, CopyText, DraftQuery, FailureReason, HttpReturnedSearch,
  Milliseconds, ReadDraft, ReadTime, SaveDraft, SearchQuery, SearchService,
  StartTimer, StorageReturnedDraft, StorageSavedDraft, TimerElapsed,
}

// This interpreter is the only place an Effect becomes an operation.
// Adapters report outcomes; update decides how those outcomes affect the model.
pub fn perform(effect: Effect, dispatch: fn(Message) -> Nil) -> Nil {
  case effect {
    SearchService(id, SearchQuery(query)) ->
      search(
        query,
        fn(stories) { dispatch(HttpReturnedSearch(id, Ok(stories))) },
        fn(reason) {
          dispatch(HttpReturnedSearch(id, Error(FailureReason(reason))))
        },
      )
    ReadTime -> dispatch(ClockReturnedTime(ClockReading(now())))
    SaveDraft(DraftQuery(text)) ->
      save(text, fn() { dispatch(StorageSavedDraft(Ok(Nil))) }, fn(reason) {
        dispatch(StorageSavedDraft(Error(FailureReason(reason))))
      })
    ReadDraft ->
      restore(
        fn(text) { dispatch(StorageReturnedDraft(Ok(DraftQuery(text)))) },
        fn(reason) {
          dispatch(StorageReturnedDraft(Error(FailureReason(reason))))
        },
      )
    CopyText(DraftQuery(text)) ->
      copy(text, fn() { dispatch(ClipboardFinished(Ok(Nil))) }, fn(reason) {
        dispatch(ClipboardFinished(Error(FailureReason(reason))))
      })
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
