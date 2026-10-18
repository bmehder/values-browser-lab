import app/model.{
  type ClockReading, type DraftQuery, type FailureReason, type Operation,
  type SearchRequestId, type Story, Clock, ClockRead, DraftRestored, DraftSaved,
  LiveClock, ManualClock, Model, ReadDraft, ReadingDraft, SaveDraft, SavingDraft,
  SearchFailed, SearchReady, SearchRequestId, SearchService, SearchSucceeded,
  Searching, StorageFailed,
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
      LiveClock -> #(
        Model(..model, clock: Clock(..model.clock, display: ClockRead(reading))),
        [],
      )
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
