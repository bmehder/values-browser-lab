import gleam/list
import model.{
  type ClockReading, type DraftQuery, type FailureReason, type Operation,
  type SearchRequestId, type Story, type TimerId, Activity, ClipboardFailed,
  Clock, ClockRead, CopyText, CopyingQuery, DraftRestored, DraftSaved, LiveClock,
  ManualClock, Milliseconds, Model, QueryCopied, ReadDraft, ReadTime,
  ReadingDraft, SaveDraft, SavingDraft, SearchFailed, SearchReady,
  SearchRequestId, SearchService, SearchSucceeded, Searching, StartTimer,
  StorageFailed, Timer, TimerFinished, TimerId, TimerRunning,
}
import query.{EmptyQuery}

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
            search_state: Searching(model.next_search_request_id, query),
            next_search_request_id: SearchRequestId(next + 1),
          ),
          [SearchService(model.next_search_request_id, query)],
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
          Ok(stories) -> SearchSucceeded(query, stories)
          Error(reason) -> SearchFailed(query, reason)
        }
        #(Model(..model, search_state: state), [])
      }
      _ -> #(model, [])
    }
  }
}

pub fn request_time() -> Operation {
  fn(model: model.Model) { #(model, [ReadTime]) }
}

pub fn record_time(reading: ClockReading) -> Operation {
  fn(model: model.Model) {
    #(
      Model(..model, clock: Clock(..model.clock, display: ClockRead(reading))),
      [],
    )
  }
}

pub fn toggle_live_clock() -> Operation {
  fn(model: model.Model) {
    let mode = case model.clock.mode {
      ManualClock -> LiveClock
      LiveClock -> ManualClock
    }
    #(Model(..model, clock: Clock(..model.clock, mode: mode)), [])
  }
}

pub fn receive_clock_tick(reading: ClockReading) -> Operation {
  fn(model: model.Model) {
    case model.clock.mode {
      LiveClock -> record_time(reading)(model)
      ManualClock -> #(model, [])
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

pub fn copy_query() -> Operation {
  fn(model: model.Model) {
    #(Model(..model, clipboard_state: CopyingQuery), [
      CopyText(model.draft_query),
    ])
  }
}

pub fn receive_copy_result(result: Result(Nil, FailureReason)) -> Operation {
  fn(model: model.Model) {
    let state = case result {
      Ok(_) -> QueryCopied
      Error(reason) -> ClipboardFailed(reason)
    }
    #(Model(..model, clipboard_state: state), [])
  }
}

pub fn start_timer() -> Operation {
  fn(model: model.Model) {
    let id = model.timer.next_id
    let TimerId(number) = id
    #(
      Model(
        ..model,
        timer: Timer(state: TimerRunning(id), next_id: TimerId(number + 1)),
      ),
      [StartTimer(id, Milliseconds(3000))],
    )
  }
}

pub fn record_timer_completion(id: TimerId) -> Operation {
  fn(model: model.Model) {
    case model.timer.state {
      TimerRunning(active) if active == id -> #(
        Model(..model, timer: Timer(..model.timer, state: TimerFinished)),
        [],
      )
      _ -> #(model, [])
    }
  }
}

pub fn record_activity(
  operation: Operation,
  message: model.Message,
) -> Operation {
  fn(current) {
    let #(next, effects) = operation(current)
    #(
      Model(
        ..next,
        activity: list.take([Activity(message, effects), ..next.activity], 18),
      ),
      effects,
    )
  }
}
