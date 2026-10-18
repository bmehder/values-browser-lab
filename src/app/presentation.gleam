import app/model.{
  type Model, type Subscription, ClockRead, ClockReading, ClockUnread,
  DraftRestored, DraftSaved, EverySecond, FailureReason, LiveClock, ManualClock,
  ReadingDraft, SavingDraft, SearchFailed, SearchReady, SearchSucceeded,
  Searching, StorageFailed, StorageReady, Story, StoryTitle, StoryUrl,
}
import app/query
import gleam/list

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
  Screen(
    draft,
    status,
    query,
    list.map(stories, story_link),
    clock,
    clock_mode,
    clock_action_label,
    storage,
  )
}

fn story_link(story: model.Story) -> StoryLink {
  let Story(StoryTitle(title), StoryUrl(url)) = story
  StoryLink(title, url)
}
