// Mutable storage and JavaScript exception cleanup; scheduling lives in Gleam.
export const reference = value => ({ value })
export const read = reference => reference.value
export const write = (reference, value) => { reference.value = value }
export const with_cleanup = (work, cleanup) => {
  try { work() } finally { cleanup() }
}
