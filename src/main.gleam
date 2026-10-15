import domain
import effects
import model.{
  type Effect, type Message, type Model, type Operation, type Subscription,
  ClockTicked, UserCopiedQuery, UserEditedQuery, UserRequestedTime,
  UserRestoredDraft, UserSavedDraft, UserStartedTimer, UserSubmittedSearch,
  UserToggledClock,
}
import presentation.{type Screen}

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
      fn(text) { UserEditedQuery(model.DraftQuery(text)) },
      UserSubmittedSearch,
      UserRequestedTime,
      UserSavedDraft,
      UserRestoredDraft,
      UserCopiedQuery,
      UserStartedTimer,
      UserToggledClock,
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
