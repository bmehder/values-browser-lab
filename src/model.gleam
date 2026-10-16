// Domain vocabulary. Primitive representations are named at their boundaries.
import query

pub type DraftQuery =
  query.Query(query.Unchecked)

pub type SearchQuery =
  query.Query(query.Searchable)

pub type SearchRequestId {
  SearchRequestId(Int)
}

pub type TimerId {
  TimerId(Int)
}

pub type Milliseconds {
  Milliseconds(Int)
}

pub type ClockReading {
  ClockReading(String)
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

pub type ClockMode {
  ManualClock
  LiveClock
}

pub type ClockDisplay {
  ClockUnread
  ClockRead(ClockReading)
}

pub type Clock {
  Clock(display: ClockDisplay, mode: ClockMode)
}

pub type StorageState {
  StorageReady
  SavingDraft
  ReadingDraft
  DraftSaved
  DraftRestored
  StorageFailed(FailureReason)
}

pub type ClipboardState {
  ClipboardReady
  CopyingQuery
  QueryCopied
  ClipboardFailed(FailureReason)
}

pub type TimerState {
  TimerReady
  TimerRunning(TimerId)
  TimerFinished
}

pub type Timer {
  Timer(state: TimerState, next_id: TimerId)
}

pub type Effect {
  SearchService(SearchRequestId, SearchQuery)
  ReadTime
  SaveDraft(DraftQuery)
  ReadDraft
  CopyText(DraftQuery)
  StartTimer(TimerId, Milliseconds)
}

pub type Subscription {
  EverySecond
}

// User messages report observed input or requested work, not successful effects.
// External result messages describe an attempt that may have succeeded or failed.
pub type Message {
  UserEditedDraftQuery(DraftQuery)
  UserSubmittedSearch
  UserRequestedTime
  UserRequestedDraftSave
  UserRequestedDraftRestore
  UserRequestedQueryCopy
  UserRequestedTimerStart
  UserRequestedLiveClockToggle
  HttpReturnedSearchResult(SearchRequestId, Result(List(Story), FailureReason))
  ClockReturnedTime(ClockReading)
  ClockTicked(ClockReading)
  StorageReturnedSaveResult(Result(Nil, FailureReason))
  StorageReturnedReadResult(Result(DraftQuery, FailureReason))
  ClipboardReturnedWriteResult(Result(Nil, FailureReason))
  TimerElapsed(TimerId)
}

pub type Activity {
  Activity(message: Message, requested_effects: List(Effect))
}

pub type Model {
  Model(
    draft_query: DraftQuery,
    search_state: SearchState,
    next_search_request_id: SearchRequestId,
    clock: Clock,
    storage_state: StorageState,
    clipboard_state: ClipboardState,
    timer: Timer,
    activity: List(Activity),
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
    clock: Clock(display: ClockUnread, mode: ManualClock),
    storage_state: StorageReady,
    clipboard_state: ClipboardReady,
    timer: Timer(state: TimerReady, next_id: TimerId(1)),
    activity: [],
  )
}
