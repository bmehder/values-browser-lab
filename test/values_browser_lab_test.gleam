import domain
import gleeunit
import model.{
  ClockRead, ClockReading, ClockTicked, DraftQuery, DraftRestored, EverySecond,
  FailureReason, HttpReturnedSearch, LiveClock, ManualClock, Milliseconds, Model,
  SearchQuery, SearchReady, SearchRequestId, SearchService, SearchSucceeded,
  Searching, StartTimer, StorageFailed, StorageReturnedDraft, TimerElapsed,
  TimerFinished, TimerId, TimerRunning, UserEditedQuery, UserStartedTimer,
  UserSubmittedSearch, UserToggledClock,
}
import presentation

pub fn main() {
  gleeunit.main()
}

fn apply(
  current: model.Model,
  message: model.Message,
) -> #(model.Model, List(model.Effect)) {
  domain.update(message)(current)
}

pub fn operation_is_reusable_without_captured_model_test() {
  let submit = domain.update(UserSubmittedSearch)
  let #(one, _) = submit(model.initial())
  let #(two, _) =
    submit(Model(..model.initial(), draft_query: DraftQuery("types")))
  let assert Searching(
    SearchRequestId(1),
    SearchQuery("functional programming"),
  ) = one.search_state
  let assert Searching(SearchRequestId(1), SearchQuery("types")) =
    two.search_state
}

pub fn stale_search_does_not_replace_current_results_test() {
  let #(pending_one, _) = apply(model.initial(), UserSubmittedSearch)
  let assert #(edited, []) =
    apply(pending_one, UserEditedQuery(DraftQuery("types")))
  let assert #(
    pending_two,
    [SearchService(SearchRequestId(2), SearchQuery("types"))],
  ) = apply(edited, UserSubmittedSearch)
  let assert #(old, []) =
    apply(pending_two, HttpReturnedSearch(SearchRequestId(1), Ok([])))
  let assert Searching(SearchRequestId(2), SearchQuery("types")) =
    old.search_state
  let assert #(new, []) =
    apply(old, HttpReturnedSearch(SearchRequestId(2), Ok([])))
  assert new.search_state == SearchSucceeded(SearchQuery("types"), [])
  let assert #(late, []) =
    apply(
      new,
      HttpReturnedSearch(SearchRequestId(1), Error(FailureReason("offline"))),
    )
  assert late.search_state == new.search_state
}

pub fn blank_submission_supersedes_pending_search_test() {
  let #(pending, _) = apply(model.initial(), UserSubmittedSearch)
  let assert #(blank, []) = apply(pending, UserEditedQuery(DraftQuery("   ")))
  let assert #(idle, []) = apply(blank, UserSubmittedSearch)
  let assert #(late, []) =
    apply(idle, HttpReturnedSearch(SearchRequestId(1), Ok([])))
  assert late.search_state == SearchReady
}

pub fn restarted_timer_ignores_previous_completion_test() {
  let assert #(one, [StartTimer(TimerId(1), Milliseconds(3000))]) =
    apply(model.initial(), UserStartedTimer)
  let assert #(two, [StartTimer(TimerId(2), Milliseconds(3000))]) =
    apply(one, UserStartedTimer)
  let assert #(stale, []) = apply(two, TimerElapsed(TimerId(1)))
  assert stale.timer.state == TimerRunning(TimerId(2))
  let assert #(done, []) = apply(stale, TimerElapsed(TimerId(2)))
  assert done.timer.state == TimerFinished
  assert presentation.view(done).timer == "Three seconds elapsed."
}

pub fn live_clock_subscription_and_late_tick_test() {
  let initial = model.initial()
  assert presentation.subscriptions(initial) == []
  let assert #(on, []) = apply(initial, UserToggledClock)
  assert on.clock.mode == LiveClock
  assert presentation.subscriptions(on) == [EverySecond]
  let assert #(ticked, []) = apply(on, ClockTicked(ClockReading("12:34:56")))
  let assert #(off, []) = apply(ticked, UserToggledClock)
  assert off.clock.mode == ManualClock
  assert presentation.subscriptions(off) == []
  let assert #(late, []) = apply(off, ClockTicked(ClockReading("12:34:57")))
  assert late.clock.display == ClockRead(ClockReading("12:34:56"))
}

pub fn storage_failure_preserves_draft_test() {
  let initial = model.initial()
  let assert #(failed, []) =
    apply(initial, StorageReturnedDraft(Error(FailureReason("blocked"))))
  assert failed.draft_query == initial.draft_query
  assert failed.storage_state == StorageFailed(FailureReason("blocked"))
  let assert #(restored, []) =
    apply(initial, StorageReturnedDraft(Ok(DraftQuery("saved query"))))
  assert restored.draft_query == DraftQuery("saved query")
  assert restored.storage_state == DraftRestored
}

pub fn editing_draft_preserves_submitted_query_test() {
  let #(pending, _) = apply(model.initial(), UserSubmittedSearch)
  let assert #(edited, []) =
    apply(pending, UserEditedQuery(DraftQuery("something else")))
  let assert Searching(_, submitted) = edited.search_state
  assert submitted == SearchQuery("functional programming")
  assert presentation.view(edited).draft == "something else"
}
