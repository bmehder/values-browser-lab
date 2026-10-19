import app/model.{
  DraftRestored, FailureReason, HttpReturnedSearchResult, Model, SearchReady,
  SearchRequestId, SearchService, SearchSucceeded, Searching, StorageFailed,
  StorageReturnedReadResult, UserEditedDraftQuery, UserSubmittedSearch,
}
import app/presentation
import app/query.{EmptyQuery}
import app/update
import gleeunit

pub fn main() {
  gleeunit.main()
}

fn apply(
  current: model.Model,
  message: model.Message,
) -> #(model.Model, List(model.Effect)) {
  update.update(message)(current)
}

fn prepared(text: String) -> query.Query(query.Searchable) {
  let assert Ok(query) = query.prepare(query.from_input(text))
  query
}

pub fn query_preparation_normalizes_without_changing_the_draft_test() {
  let draft = query.from_input("  values  ")
  let assert Ok(searchable) = query.prepare(draft)
  assert query.to_string(draft) == "  values  "
  assert query.to_string(searchable) == "values"
  let #(edited, _) = apply(model.initial(), UserEditedDraftQuery(draft))
  let assert #(next, [SearchService(SearchRequestId(1), sent)]) =
    apply(edited, UserSubmittedSearch)
  assert sent == searchable
  assert next.draft_query == draft
  assert next.search_state == Searching(SearchRequestId(1), searchable)
}

pub fn blank_queries_cannot_be_prepared_test() {
  assert query.prepare(query.from_input("")) == Error(EmptyQuery)
  assert query.prepare(query.from_input(" \n\t ")) == Error(EmptyQuery)
}

pub fn operation_is_reusable_without_captured_model_test() {
  let submit = update.update(UserSubmittedSearch)
  let #(one, _) = submit(model.initial())
  let #(two, _) =
    submit(Model(..model.initial(), draft_query: query.from_input("types")))
  assert one.search_state
    == Searching(SearchRequestId(1), prepared("functional programming"))
  assert two.search_state == Searching(SearchRequestId(1), prepared("types"))
}

pub fn stale_search_does_not_replace_current_results_test() {
  let #(pending_one, _) = apply(model.initial(), UserSubmittedSearch)
  let assert #(edited, []) =
    apply(pending_one, UserEditedDraftQuery(query.from_input("types")))
  let assert #(pending_two, [SearchService(SearchRequestId(2), sent)]) =
    apply(edited, UserSubmittedSearch)
  assert query.to_string(sent) == "types"
  let assert #(old, []) =
    apply(pending_two, HttpReturnedSearchResult(SearchRequestId(1), Ok([])))
  assert old.search_state == Searching(SearchRequestId(2), prepared("types"))
  let assert #(new, []) =
    apply(old, HttpReturnedSearchResult(SearchRequestId(2), Ok([])))
  assert new.search_state == SearchSucceeded(prepared("types"), [])
  let assert #(late, []) =
    apply(
      new,
      HttpReturnedSearchResult(
        SearchRequestId(1),
        Error(FailureReason("offline")),
      ),
    )
  assert late.search_state == new.search_state
}

pub fn blank_submission_supersedes_pending_search_test() {
  let #(pending, _) = apply(model.initial(), UserSubmittedSearch)
  let assert #(blank, []) =
    apply(pending, UserEditedDraftQuery(query.from_input("   ")))
  let assert #(idle, []) = apply(blank, UserSubmittedSearch)
  let assert #(late, []) =
    apply(idle, HttpReturnedSearchResult(SearchRequestId(1), Ok([])))
  assert late.search_state == SearchReady
  assert idle.next_search_request_id == pending.next_search_request_id
}

pub fn storage_failure_preserves_draft_test() {
  let initial = model.initial()
  let assert #(failed, []) =
    apply(initial, StorageReturnedReadResult(Error(FailureReason("blocked"))))
  assert failed.draft_query == initial.draft_query
  assert failed.storage_state == StorageFailed(FailureReason("blocked"))
  let assert #(restored, []) =
    apply(
      initial,
      StorageReturnedReadResult(Ok(query.from_input("  saved query  "))),
    )
  assert query.to_string(restored.draft_query) == "  saved query  "
  assert restored.storage_state == DraftRestored
}

pub fn editing_draft_preserves_submitted_query_test() {
  let #(pending, _) = apply(model.initial(), UserSubmittedSearch)
  let assert #(edited, []) =
    apply(pending, UserEditedDraftQuery(query.from_input("something else")))
  assert edited.search_state
    == Searching(SearchRequestId(1), prepared("functional programming"))
  assert presentation.describe(edited).draft == "something else"
}
