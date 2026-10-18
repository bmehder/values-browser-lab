import app/model.{
  type Message, type Operation, ClockTicked, HttpReturnedSearchResult,
  StorageReturnedReadResult, StorageReturnedSaveResult, UserEditedDraftQuery,
  UserRequestedDraftRestore, UserRequestedDraftSave,
  UserRequestedLiveClockToggle, UserSubmittedSearch,
}
import app/operations

// Read a message; choose its operation. The coordinator supplies the model later.
pub fn update(message: Message) -> Operation {
  case message {
    UserEditedDraftQuery(query) -> operations.edit_draft(query)
    UserSubmittedSearch -> operations.begin_search()
    UserRequestedDraftSave -> operations.save_draft()
    UserRequestedDraftRestore -> operations.restore_draft()
    UserRequestedLiveClockToggle -> operations.toggle_live_clock()
    HttpReturnedSearchResult(request, result) ->
      operations.receive_search_result(request, result)
    ClockTicked(reading) -> operations.receive_clock_tick(reading)
    StorageReturnedSaveResult(result) -> operations.receive_save_result(result)
    StorageReturnedReadResult(result) ->
      operations.receive_restore_result(result)
  }
}
