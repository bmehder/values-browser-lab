// Domain vocabulary. Primitive representations are named at their boundaries.
import app/query

pub type DraftQuery =
  query.Query(query.Unchecked)

pub type SearchQuery =
  query.Query(query.Searchable)

pub type SearchRequestId {
  SearchRequestId(Int)
}

pub type FailureReason {
  FailureReason(String)
}

pub type StoryTitle {
  StoryTitle(String)
}

pub type StoryUrl {
  StoryUrl(String)
}

pub type Story {
  Story(title: StoryTitle, url: StoryUrl)
}

pub type SearchState {
  SearchReady
  Searching(request: SearchRequestId, query: SearchQuery)
  SearchSucceeded(query: SearchQuery, stories: List(Story))
  SearchFailed(query: SearchQuery, reason: FailureReason)
}

pub type StorageState {
  StorageReady
  SavingDraft
  ReadingDraft
  DraftSaved
  DraftRestored
  StorageFailed(FailureReason)
}

pub type Effect {
  SearchService(request: SearchRequestId, query: SearchQuery)
  SaveDraft(DraftQuery)
  ReadDraft
}

// User messages report observed input or requested work, not successful effects.
// External result messages describe an attempt that may have succeeded or failed.
pub type Message {
  UserEditedDraftQuery(DraftQuery)
  UserSubmittedSearch
  UserRequestedDraftSave
  UserRequestedDraftRestore
  HttpReturnedSearchResult(
    request: SearchRequestId,
    result: Result(List(Story), FailureReason),
  )
  StorageReturnedSaveResult(Result(Nil, FailureReason))
  StorageReturnedReadResult(Result(DraftQuery, FailureReason))
}

pub type Model {
  Model(
    draft_query: DraftQuery,
    search_state: SearchState,
    next_search_request_id: SearchRequestId,
    storage_state: StorageState,
  )
}

// An operation describes one pure state transition; it does not run effects.
pub type Operation =
  fn(Model) -> #(Model, List(Effect))

pub fn initial() -> Model {
  Model(
    draft_query: query.from_input("functional programming"),
    search_state: SearchReady,
    next_search_request_id: SearchRequestId(1),
    storage_state: StorageReady,
  )
}
