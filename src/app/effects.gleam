import app/model.{
  type Effect, type Message, type Story, FailureReason, HttpReturnedSearchResult,
  ReadDraft, SaveDraft, SearchService, StorageReturnedReadResult,
  StorageReturnedSaveResult,
}
import app/query

// Interpret effect descriptions by starting browser work.
// Adapters report outcomes; update decides how those outcomes affect the model.
pub fn perform(effect: Effect, dispatch: fn(Message) -> Nil) -> Nil {
  case effect {
    SearchService(id, prepared_query) ->
      search(
        query: query.to_string(prepared_query),
        on_success: fn(stories) {
          stories
          |> Ok
          |> HttpReturnedSearchResult(request: id, result: _)
          |> dispatch
        },
        on_failure: fn(reason) {
          reason
          |> FailureReason
          |> Error
          |> HttpReturnedSearchResult(request: id, result: _)
          |> dispatch
        },
      )
    SaveDraft(draft) ->
      save(
        text: query.to_string(draft),
        on_success: fn() {
          Ok(Nil)
          |> StorageReturnedSaveResult
          |> dispatch
        },
        on_failure: fn(reason) {
          reason
          |> FailureReason
          |> Error
          |> StorageReturnedSaveResult
          |> dispatch
        },
      )
    ReadDraft ->
      restore(
        on_success: fn(text) {
          text
          |> query.from_input
          |> Ok
          |> StorageReturnedReadResult
          |> dispatch
        },
        on_failure: fn(reason) {
          reason
          |> FailureReason
          |> Error
          |> StorageReturnedReadResult
          |> dispatch
        },
      )
  }
}

@external(javascript, "./browser_effects.mjs", "search")
fn search(
  query query: String,
  on_success success: fn(List(Story)) -> Nil,
  on_failure failure: fn(String) -> Nil,
) -> Nil

@external(javascript, "./browser_effects.mjs", "save")
fn save(
  text text: String,
  on_success success: fn() -> Nil,
  on_failure failure: fn(String) -> Nil,
) -> Nil

@external(javascript, "./browser_effects.mjs", "restore")
fn restore(
  on_success success: fn(String) -> Nil,
  on_failure failure: fn(String) -> Nil,
) -> Nil
