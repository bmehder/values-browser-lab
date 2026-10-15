import domain.{
  ClockTicked, EverySecond, Found, HttpReturnedSearch, Idle, Loading,
  SearchService, StartTimer, StorageReturnedDraft, Story, TimerElapsed,
  UserEditedQuery, UserStartedTimer, UserSubmittedSearch, UserToggledClock,
}
import gleeunit

pub fn main() {
  gleeunit.main()
}

pub fn stale_search_does_not_replace_current_results_test() {
  let assert #(one, []) =
    domain.update(domain.initial(), UserEditedQuery("gleam"))
  let assert #(pending_one, [SearchService(1, "gleam")]) =
    domain.update(one, UserSubmittedSearch)
  let assert #(two, []) = domain.update(pending_one, UserEditedQuery("types"))
  let assert #(pending_two, [SearchService(2, "types")]) =
    domain.update(two, UserSubmittedSearch)
  let assert #(old, []) =
    domain.update(
      pending_two,
      HttpReturnedSearch(1, Ok([Story("Old", "https://example.com")])),
    )
  let assert Loading(2, "types") = old.search
  let assert #(new, []) = domain.update(old, HttpReturnedSearch(2, Ok([])))
  let assert Found("types", []) = new.search
  let assert #(late_failure, []) =
    domain.update(new, HttpReturnedSearch(1, Error("offline")))
  assert late_failure.search == new.search
}

pub fn blank_submission_supersedes_pending_search_test() {
  let #(pending, _) = domain.update(domain.initial(), UserSubmittedSearch)
  let assert #(blank, []) = domain.update(pending, UserEditedQuery("   "))
  let assert #(idle, []) = domain.update(blank, UserSubmittedSearch)
  let assert #(late, []) = domain.update(idle, HttpReturnedSearch(1, Ok([])))
  assert late.search == Idle
}

pub fn restarted_timer_ignores_previous_completion_test() {
  let assert #(one, [StartTimer(1, 3000)]) =
    domain.update(domain.initial(), UserStartedTimer)
  let assert #(two, [StartTimer(2, 3000)]) =
    domain.update(one, UserStartedTimer)
  let assert #(stale, []) = domain.update(two, TimerElapsed(1))
  assert stale.timer_waiting
  let assert #(done, []) = domain.update(stale, TimerElapsed(2))
  assert !done.timer_waiting
  assert done.timer == "Three seconds elapsed."
}

pub fn live_clock_subscription_and_late_tick_test() {
  let initial = domain.initial()
  assert domain.subscriptions(initial) == []
  let assert #(on, []) = domain.update(initial, UserToggledClock)
  assert domain.subscriptions(on) == [EverySecond]
  let assert #(ticked, []) = domain.update(on, ClockTicked("12:34:56"))
  assert ticked.clock == "12:34:56"
  let assert #(off, []) = domain.update(ticked, UserToggledClock)
  assert domain.subscriptions(off) == []
  let assert #(late, []) = domain.update(off, ClockTicked("12:34:57"))
  assert late.clock == "12:34:56"
}

pub fn storage_failure_preserves_draft_test() {
  let initial = domain.initial()
  let assert #(failed, []) =
    domain.update(initial, StorageReturnedDraft(Error("blocked")))
  assert failed.draft == initial.draft
  assert failed.storage == "blocked"
  let assert #(restored, []) =
    domain.update(initial, StorageReturnedDraft(Ok("saved query")))
  assert restored.draft == "saved query"
}

pub fn editing_draft_preserves_submitted_query_test() {
  let #(pending, _) = domain.update(domain.initial(), UserSubmittedSearch)
  let assert #(edited, []) =
    domain.update(pending, UserEditedQuery("something else"))
  let assert Loading(_, submitted) = edited.search
  assert submitted == "functional programming"
  assert domain.view(edited).draft == "something else"
}
