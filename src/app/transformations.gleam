import app/model.{
  type DraftQuery, type FailureReason, type Operation, type SearchRequestId,
  type Story, DraftRestored, DraftSaved, Model, ReadDraft, ReadingDraft,
  SaveDraft, SavingDraft, SearchFailed, SearchReady, SearchRequestId,
  SearchService, SearchSucceeded, Searching, StorageFailed,
}
import app/query.{EmptyQuery}

pub fn edit_draft(query: DraftQuery) -> Operation {
  fn(model: model.Model) { #(Model(..model, draft_query: query), []) }
}

pub fn begin_search() -> Operation {
  fn(model: model.Model) {
    let SearchRequestId(next) = model.next_search_request_id
    case query.prepare(model.draft_query) {
      Error(EmptyQuery) -> #(Model(..model, search_state: SearchReady), [])
      Ok(query) -> {
        #(
          Model(
            ..model,
            search_state: Searching(
              request: model.next_search_request_id,
              query: query,
            ),
            next_search_request_id: SearchRequestId(next + 1),
          ),
          [SearchService(request: model.next_search_request_id, query: query)],
        )
      }
    }
  }
}

pub fn receive_search_result(
  request: SearchRequestId,
  result: Result(List(Story), FailureReason),
) -> Operation {
  fn(model: model.Model) {
    case model.search_state {
      Searching(active, query) if active == request -> {
        let state = case result {
          Ok(stories) -> SearchSucceeded(query: query, stories: stories)
          Error(reason) -> SearchFailed(query: query, reason: reason)
        }
        #(Model(..model, search_state: state), [])
      }
      _ -> #(model, [])
    }
  }
}

pub fn save_draft() -> Operation {
  fn(model: model.Model) {
    #(Model(..model, storage_state: SavingDraft), [SaveDraft(model.draft_query)])
  }
}

pub fn restore_draft() -> Operation {
  fn(model: model.Model) {
    #(Model(..model, storage_state: ReadingDraft), [ReadDraft])
  }
}

pub fn receive_save_result(result: Result(Nil, FailureReason)) -> Operation {
  fn(model: model.Model) {
    let state = case result {
      Ok(_) -> DraftSaved
      Error(reason) -> StorageFailed(reason)
    }
    #(Model(..model, storage_state: state), [])
  }
}

pub fn receive_restore_result(
  result: Result(DraftQuery, FailureReason),
) -> Operation {
  fn(model: model.Model) {
    case result {
      Ok(query) -> #(
        Model(..model, draft_query: query, storage_state: DraftRestored),
        [],
      )
      Error(reason) -> #(
        Model(..model, storage_state: StorageFailed(reason)),
        [],
      )
    }
  }
}
