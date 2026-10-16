import model.{
  type Message, type Operation, ClipboardReturnedWriteResult, ClockReturnedTime,
  ClockTicked, HttpReturnedSearchResult, StorageReturnedReadResult,
  StorageReturnedSaveResult, TimerElapsed, UserEditedDraftQuery,
  UserRequestedDraftRestore, UserRequestedDraftSave,
  UserRequestedLiveClockToggle, UserRequestedQueryCopy, UserRequestedTime,
  UserRequestedTimerStart, UserSubmittedSearch,
}
import operations

// Read a message; choose its operation. The coordinator supplies the model later.
pub fn update(message: Message) -> Operation {
  let operation = case message {
    UserEditedDraftQuery(query) -> operations.edit_draft(query)
    UserSubmittedSearch -> operations.begin_search()
    UserRequestedTime -> operations.request_time()
    UserRequestedDraftSave -> operations.save_draft()
    UserRequestedDraftRestore -> operations.restore_draft()
    UserRequestedQueryCopy -> operations.copy_query()
    UserRequestedTimerStart -> operations.start_timer()
    UserRequestedLiveClockToggle -> operations.toggle_live_clock()
    HttpReturnedSearchResult(request, result) ->
      operations.receive_search_result(request, result)
    ClockReturnedTime(reading) -> operations.record_time(reading)
    ClockTicked(reading) -> operations.receive_clock_tick(reading)
    StorageReturnedSaveResult(result) -> operations.receive_save_result(result)
    StorageReturnedReadResult(result) ->
      operations.receive_restore_result(result)
    ClipboardReturnedWriteResult(result) ->
      operations.receive_copy_result(result)
    TimerElapsed(timer) -> operations.record_timer_completion(timer)
  }
  operations.record_activity(operation, message)
}
