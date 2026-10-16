import gleam/string

// The stage parameter is phantom: it is not stored in the constructor.
// Keeping the constructor private makes preparation the only way to advance.
pub opaque type Query(stage) {
  Query(String)
}

// Type-level stage labels. No marker values need to be constructed.
pub type Unchecked

pub type Searchable

pub type QueryProblem {
  EmptyQuery
}

pub fn from_input(text: String) -> Query(Unchecked) {
  Query(text)
}

pub fn prepare(
  query: Query(Unchecked),
) -> Result(Query(Searchable), QueryProblem) {
  let Query(text) = query
  case string.trim(text) {
    "" -> Error(EmptyQuery)
    normalized -> Ok(Query(normalized))
  }
}

// Reading the representation never changes its stage.
pub fn to_string(query: Query(stage)) -> String {
  let Query(text) = query
  text
}
