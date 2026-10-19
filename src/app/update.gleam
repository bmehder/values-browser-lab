import app/model.{
  type Message, type Operation, HttpReturnedSearchResult,
  StorageReturnedReadResult, StorageReturnedSaveResult, UserEditedDraftQuery,
  UserRequestedDraftRestore, UserRequestedDraftSave, UserSubmittedSearch,
}
import app/transformations

// Each branch calls an operation builder, capturing any message data.
// The builder returns fn(Model) -> #(Model, List(Effect)); it does not run effects.
// The runtime applies that returned function to the current model later.
pub fn update(message: Message) -> Operation {
  case message {
    UserEditedDraftQuery(query) -> transformations.edit_draft(query)
    UserSubmittedSearch -> transformations.begin_search()
    UserRequestedDraftSave -> transformations.save_draft()
    UserRequestedDraftRestore -> transformations.restore_draft()
    HttpReturnedSearchResult(request, result) ->
      transformations.receive_search_result(request, result)
    StorageReturnedSaveResult(result) ->
      transformations.receive_save_result(result)
    StorageReturnedReadResult(result) ->
      transformations.receive_restore_result(result)
  }
}
