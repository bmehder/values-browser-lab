import domain
import effects
import model.{
  type Effect, type Message, type Model, type Operation, type Subscription,
  ClockTicked, UserEditedDraftQuery, UserRequestedDraftRestore,
  UserRequestedDraftSave, UserRequestedLiveClockToggle, UserRequestedQueryCopy,
  UserRequestedTime, UserRequestedTimerStart, UserSubmittedSearch,
}
import presentation.{type Screen}
import query

pub type Actions {
  Actions(
    edit: fn(String) -> Message,
    search: Message,
    time: Message,
    save: Message,
    restore: Message,
    copy: Message,
    timer: Message,
    toggle_clock: Message,
    tick: fn(String) -> Message,
  )
}

pub fn main() -> Nil {
  start(
    model.initial(),
    domain.update,
    presentation.view,
    presentation.subscriptions,
    effects.perform,
    Actions(
      fn(text) { UserEditedDraftQuery(query.from_input(text)) },
      UserSubmittedSearch,
      UserRequestedTime,
      UserRequestedDraftSave,
      UserRequestedDraftRestore,
      UserRequestedQueryCopy,
      UserRequestedTimerStart,
      UserRequestedLiveClockToggle,
      fn(time) { ClockTicked(model.ClockReading(time)) },
    ),
  )
}

@external(javascript, "./runtime.mjs", "start")
fn start(
  model: Model,
  update: fn(Message) -> Operation,
  view: fn(Model) -> Screen,
  subscriptions: fn(Model) -> List(Subscription),
  perform: fn(Effect, fn(Message) -> Nil) -> Nil,
  actions: Actions,
) -> Nil
