import app/query

// Words, booleans encoded for DOM attributes, and display strings belong here.
import app/model.{
  type Activity, type Effect, type Message, type Model, type Subscription,
  Activity, ClipboardFailed, ClipboardReady, ClipboardReturnedWriteResult,
  ClockRead, ClockReading, ClockReturnedTime, ClockTicked, ClockUnread, CopyText,
  CopyingQuery, DraftRestored, DraftSaved, EverySecond, FailureReason,
  HttpReturnedSearchResult, LiveClock, ManualClock, QueryCopied, ReadDraft,
  ReadTime, ReadingDraft, SaveDraft, SavingDraft, SearchFailed, SearchReady,
  SearchRequestId, SearchService, SearchSucceeded, Searching, StartTimer,
  StorageFailed, StorageReady, StorageReturnedReadResult,
  StorageReturnedSaveResult, Story, StoryTitle, StoryUrl, TimerElapsed,
  TimerFinished, TimerId, TimerReady, TimerRunning, UserEditedDraftQuery,
  UserRequestedDraftRestore, UserRequestedDraftSave,
  UserRequestedLiveClockToggle, UserRequestedQueryCopy, UserRequestedTime,
  UserRequestedTimerStart, UserSubmittedSearch,
}
import gleam/int
import gleam/list
import gleam/string

// The browser receives a presentation projection, not domain state to interpret.
pub type StoryLink {
  StoryLink(title: String, url: String)
}

pub type Screen {
  Screen(
    draft: String,
    status: String,
    query: String,
    stories: List(StoryLink),
    clock: String,
    clock_mode: String,
    clock_action_label: String,
    storage: String,
    clipboard: String,
    timer: String,
    timer_action_label: String,
    history: List(String),
  )
}

pub fn subscriptions(model: Model) -> List(Subscription) {
  case model.clock.mode {
    LiveClock -> [EverySecond]
    ManualClock -> []
  }
}

pub fn view(model: Model) -> Screen {
  let draft = query.to_string(model.draft_query)
  let #(status, query, stories) = case model.search_state {
    SearchReady -> #(
      "Ready when you are",
      "Search Hacker News stories. No account needed.",
      [],
    )
    Searching(_, prepared) -> #("Searching…", query.to_string(prepared), [])
    SearchSucceeded(prepared, []) -> #(
      "No stories found",
      query.to_string(prepared),
      [],
    )
    SearchSucceeded(prepared, stories) -> #(
      "Stories found",
      query.to_string(prepared),
      stories,
    )
    SearchFailed(prepared, FailureReason(reason)) -> #(
      "Search failed",
      query.to_string(prepared) <> " · " <> reason,
      [],
    )
  }
  let clock = case model.clock.display {
    ClockUnread -> "Not read yet"
    ClockRead(ClockReading(time)) -> time
  }
  let #(clock_mode, clock_action_label) = case model.clock.mode {
    LiveClock -> #("live", "Stop live clock")
    ManualClock -> #("manual", "Start live clock")
  }
  let storage = case model.storage_state {
    StorageReady -> "Save a query in this browser."
    SavingDraft -> "Saving…"
    ReadingDraft -> "Reading…"
    DraftSaved -> "Saved in this browser."
    DraftRestored -> "Saved query restored."
    StorageFailed(FailureReason(reason)) -> reason
  }
  let clipboard = case model.clipboard_state {
    ClipboardReady -> "Copy the current query."
    CopyingQuery -> "Copying…"
    QueryCopied -> "Copied to clipboard."
    ClipboardFailed(FailureReason(reason)) -> reason
  }
  let #(timer, timer_action_label) = case model.timer.state {
    TimerReady -> #(
      "A three-second timer, described as data.",
      "Start 3-second timer",
    )
    TimerRunning(_) -> #("Waiting for the browser…", "Restart timer")
    TimerFinished -> #("Three seconds elapsed.", "Start 3-second timer")
  }
  Screen(
    draft,
    status,
    query,
    list.map(stories, story_link),
    clock,
    clock_mode,
    clock_action_label,
    storage,
    clipboard,
    timer,
    timer_action_label,
    list.map(model.activity, activity_text),
  )
}

fn story_link(story: model.Story) -> StoryLink {
  let Story(StoryTitle(title), StoryUrl(url)) = story
  StoryLink(title, url)
}

fn activity_text(activity: Activity) -> String {
  let Activity(message, effects) = activity
  let requested = case effects {
    [] -> "no effect"
    _ ->
      effects
      |> list.map(effect_name)
      |> string.join(", ")
  }
  message_name(message) <> " → " <> requested
}

fn effect_name(effect: Effect) -> String {
  case effect {
    SearchService(SearchRequestId(id), _) ->
      "SearchService(#" <> int.to_string(id) <> ")"
    ReadTime -> "ReadTime"
    SaveDraft(_) -> "SaveDraft"
    ReadDraft -> "ReadDraft"
    CopyText(_) -> "CopyText"
    StartTimer(TimerId(id), _) -> "StartTimer(#" <> int.to_string(id) <> ")"
  }
}

fn message_name(message: Message) -> String {
  case message {
    UserEditedDraftQuery(_) -> "UserEditedDraftQuery"
    UserSubmittedSearch -> "UserSubmittedSearch"
    UserRequestedTime -> "UserRequestedTime"
    UserRequestedDraftSave -> "UserRequestedDraftSave"
    UserRequestedDraftRestore -> "UserRequestedDraftRestore"
    UserRequestedQueryCopy -> "UserRequestedQueryCopy"
    UserRequestedTimerStart -> "UserRequestedTimerStart"
    UserRequestedLiveClockToggle -> "UserRequestedLiveClockToggle"
    HttpReturnedSearchResult(SearchRequestId(id), _) ->
      "HttpReturnedSearchResult(#" <> int.to_string(id) <> ")"
    ClockReturnedTime(_) -> "ClockReturnedTime"
    ClockTicked(_) -> "ClockTicked"
    StorageReturnedSaveResult(_) -> "StorageReturnedSaveResult"
    StorageReturnedReadResult(_) -> "StorageReturnedReadResult"
    ClipboardReturnedWriteResult(_) -> "ClipboardReturnedWriteResult"
    TimerElapsed(_) -> "TimerElapsed"
  }
}
