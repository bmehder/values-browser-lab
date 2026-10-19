import app/model.{
  type Model, DraftRestored, DraftSaved, FailureReason, ReadingDraft,
  SavingDraft, SearchFailed, SearchReady, SearchSucceeded, Searching,
  StorageFailed, StorageReady, Story, StoryTitle, StoryUrl,
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
    search_detail: String,
    stories: List(StoryLink),
    storage: String,
  )
}

pub fn describe(model: Model) -> Screen {
  let draft = query.to_string(model.draft_query)
  let #(status, search_detail, stories) = case model.search_state {
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
  let storage = case model.storage_state {
    StorageReady -> "Save a query in this browser."
    SavingDraft -> "Saving…"
    ReadingDraft -> "Reading…"
    DraftSaved -> "Saved in this browser."
    DraftRestored -> "Saved query restored."
    StorageFailed(FailureReason(reason)) -> reason
  }
  Screen(
    draft: draft,
    status: status,
    search_detail: search_detail,
    stories: list.map(stories, story_link),
    storage: storage,
  )
}

fn story_link(story: model.Story) -> StoryLink {
  let Story(StoryTitle(title), StoryUrl(url)) = story
  StoryLink(title: title, url: url)
}
