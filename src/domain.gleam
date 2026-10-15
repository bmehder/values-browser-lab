import model.{
  type Message, type Operation, ClipboardFinished, ClockReturnedTime,
  ClockTicked, HttpReturnedSearch, StorageReturnedDraft, StorageSavedDraft,
  TimerElapsed, UserCopiedQuery, UserEditedQuery, UserRequestedTime,
  UserRestoredDraft, UserSavedDraft, UserStartedTimer, UserSubmittedSearch,
  UserToggledClock,
}
import operations

// Read a message; choose its operation. The coordinator supplies the model later.
pub fn update(message: Message) -> Operation {
  let operation = case message {
    UserEditedQuery(query) -> operations.edit_draft(query)
    UserSubmittedSearch -> operations.submit_search()
    UserRequestedTime -> operations.request_time()
    UserSavedDraft -> operations.save_draft()
    UserRestoredDraft -> operations.restore_draft()
    UserCopiedQuery -> operations.copy_query()
    UserStartedTimer -> operations.start_timer()
    UserToggledClock -> operations.toggle_live_clock()
    HttpReturnedSearch(request, result) ->
      operations.receive_search(request, result)
    ClockReturnedTime(reading) -> operations.show_time(reading)
    ClockTicked(reading) -> operations.receive_clock_tick(reading)
    StorageSavedDraft(result) -> operations.receive_saved_draft(result)
    StorageReturnedDraft(result) -> operations.receive_restored_draft(result)
    ClipboardFinished(result) -> operations.receive_clipboard_result(result)
    TimerElapsed(timer) -> operations.finish_timer(timer)
  }
  operations.record_activity(operation, message)
}
