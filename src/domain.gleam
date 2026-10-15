import gleam/int
import gleam/list
import gleam/string

pub type Story {
  Story(title: String, url: String)
}

pub type Search {
  Idle
  Loading(id: Int, query: String)
  Found(query: String, stories: List(Story))
  Failed(query: String, reason: String)
}

pub type Effect {
  SearchService(Int, String)
  ReadTime
  SaveDraft(String)
  ReadDraft
  CopyText(String)
  StartTimer(Int, Int)
}

pub type Subscription {
  EverySecond
}

pub type Message {
  UserEditedQuery(String)
  UserSubmittedSearch
  UserRequestedTime
  UserSavedDraft
  UserRestoredDraft
  UserCopiedQuery
  UserStartedTimer
  UserToggledClock
  HttpReturnedSearch(Int, Result(List(Story), String))
  ClockReturnedTime(String)
  ClockTicked(String)
  StorageSavedDraft(Result(Nil, String))
  StorageReturnedDraft(Result(String, String))
  ClipboardFinished(Result(Nil, String))
  TimerElapsed(Int)
}

pub type Model {
  Model(
    draft: String,
    search: Search,
    next_id: Int,
    clock: String,
    live_clock: Bool,
    storage: String,
    clipboard: String,
    timer_id: Int,
    timer_waiting: Bool,
    timer: String,
    history: List(String),
  )
}

pub fn initial() -> Model {
  Model(
    "functional programming",
    Idle,
    1,
    "Not read yet",
    False,
    "Save a query in this browser.",
    "Copy the current query.",
    0,
    False,
    "A three-second timer, described as data.",
    [],
  )
}

// The application is pure: a message becomes a new model and effect values.
pub fn update(model: Model, message: Message) -> #(Model, List(Effect)) {
  model
  |> decide(message)
  |> record(message)
}

fn decide(model: Model, message: Message) -> #(Model, List(Effect)) {
  case message {
    UserEditedQuery(text) -> #(Model(..model, draft: text), [])
    UserSubmittedSearch -> {
      let query = string.trim(model.draft)
      case query {
        "" -> #(Model(..model, search: Idle), [])
        _ -> #(
          Model(
            ..model,
            search: Loading(model.next_id, query),
            next_id: model.next_id + 1,
          ),
          [SearchService(model.next_id, query)],
        )
      }
    }
    HttpReturnedSearch(id, result) ->
      case model.search {
        Loading(active, query) if active == id -> {
          let search = case result {
            Ok(stories) -> Found(query, stories)
            Error(reason) -> Failed(query, reason)
          }
          #(Model(..model, search: search), [])
        }
        _ -> #(model, [])
      }
    UserRequestedTime -> #(model, [ReadTime])
    ClockReturnedTime(time) -> #(Model(..model, clock: time), [])
    UserToggledClock -> #(Model(..model, live_clock: !model.live_clock), [])
    ClockTicked(time) ->
      case model.live_clock {
        True -> #(Model(..model, clock: time), [])
        False -> #(model, [])
      }
    UserSavedDraft -> #(Model(..model, storage: "Saving…"), [
      SaveDraft(model.draft),
    ])
    UserRestoredDraft -> #(Model(..model, storage: "Reading…"), [ReadDraft])
    StorageSavedDraft(result) -> #(
      Model(..model, storage: outcome(result, "Saved in this browser.")),
      [],
    )
    StorageReturnedDraft(result) ->
      case result {
        Ok(text) -> #(
          Model(..model, draft: text, storage: "Saved query restored."),
          [],
        )
        Error(reason) -> #(Model(..model, storage: reason), [])
      }
    UserCopiedQuery -> #(Model(..model, clipboard: "Copying…"), [
      CopyText(model.draft),
    ])
    ClipboardFinished(result) -> #(
      Model(..model, clipboard: outcome(result, "Copied to clipboard.")),
      [],
    )
    UserStartedTimer -> #(
      Model(
        ..model,
        timer_id: model.timer_id + 1,
        timer_waiting: True,
        timer: "Waiting for the browser…",
      ),
      [StartTimer(model.timer_id + 1, 3000)],
    )
    TimerElapsed(id) ->
      case id == model.timer_id && model.timer_waiting {
        True -> #(
          Model(..model, timer_waiting: False, timer: "Three seconds elapsed."),
          [],
        )
        False -> #(model, [])
      }
  }
}

fn outcome(result: Result(Nil, String), success: String) -> String {
  case result {
    Ok(_) -> success
    Error(reason) -> reason
  }
}

pub fn subscriptions(model: Model) -> List(Subscription) {
  case model.live_clock {
    True -> [EverySecond]
    False -> []
  }
}

fn record(
  turn: #(Model, List(Effect)),
  message: Message,
) -> #(Model, List(Effect)) {
  let #(model, effects) = turn
  let requested = case effects {
    [] -> " → no effect"
    _ -> " → " <> string.join(list.map(effects, effect_name), ", ")
  }
  #(
    Model(
      ..model,
      history: list.take(
        [message_name(message) <> requested, ..model.history],
        18,
      ),
    ),
    effects,
  )
}

pub fn effect_name(effect: Effect) -> String {
  case effect {
    SearchService(id, _) -> "SearchService(#" <> int.to_string(id) <> ")"
    ReadTime -> "ReadTime"
    SaveDraft(_) -> "SaveDraft"
    ReadDraft -> "ReadDraft"
    CopyText(_) -> "CopyText"
    StartTimer(id, _) -> "StartTimer(#" <> int.to_string(id) <> ")"
  }
}

fn message_name(message: Message) -> String {
  case message {
    UserEditedQuery(_) -> "UserEditedQuery"
    UserSubmittedSearch -> "UserSubmittedSearch"
    UserRequestedTime -> "UserRequestedTime"
    UserSavedDraft -> "UserSavedDraft"
    UserRestoredDraft -> "UserRestoredDraft"
    UserCopiedQuery -> "UserCopiedQuery"
    UserStartedTimer -> "UserStartedTimer"
    UserToggledClock -> "UserToggledClock"
    HttpReturnedSearch(id, _) ->
      "HttpReturnedSearch(#" <> int.to_string(id) <> ")"
    ClockReturnedTime(_) -> "ClockReturnedTime"
    ClockTicked(_) -> "ClockTicked"
    StorageSavedDraft(_) -> "StorageSavedDraft"
    StorageReturnedDraft(_) -> "StorageReturnedDraft"
    ClipboardFinished(_) -> "ClipboardFinished"
    TimerElapsed(_) -> "TimerElapsed"
  }
}

pub type View {
  View(
    draft: String,
    status: String,
    query: String,
    stories: List(Story),
    clock: String,
    live_clock: Bool,
    storage: String,
    clipboard: String,
    timer: String,
    timer_waiting: Bool,
    history: List(String),
  )
}

pub fn view(model: Model) -> View {
  let #(status, query, stories) = case model.search {
    Idle -> #(
      "Ready when you are",
      "Search Hacker News stories. No account needed.",
      [],
    )
    Loading(_, query) -> #("Searching…", query, [])
    Found(query, []) -> #("No stories found", query, [])
    Found(query, stories) -> #("Stories found", query, stories)
    Failed(query, reason) -> #("Search failed", query <> " · " <> reason, [])
  }
  View(
    model.draft,
    status,
    query,
    stories,
    model.clock,
    model.live_clock,
    model.storage,
    model.clipboard,
    model.timer,
    model.timer_waiting,
    model.history,
  )
}
