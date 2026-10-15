import domain.{
  type Effect, type Message, type Model, type Subscription, type View,
  ClockTicked, UserCopiedQuery, UserEditedQuery, UserRequestedTime,
  UserRestoredDraft, UserSavedDraft, UserStartedTimer, UserSubmittedSearch,
  UserToggledClock,
}
import effects

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
    domain.initial(),
    domain.update,
    domain.view,
    domain.subscriptions,
    effects.perform,
    Actions(
      UserEditedQuery,
      UserSubmittedSearch,
      UserRequestedTime,
      UserSavedDraft,
      UserRestoredDraft,
      UserCopiedQuery,
      UserStartedTimer,
      UserToggledClock,
      ClockTicked,
    ),
  )
}

@external(javascript, "./runtime.mjs", "start")
fn start(
  model: Model,
  update: fn(Model, Message) -> #(Model, List(Effect)),
  view: fn(Model) -> View,
  subscriptions: fn(Model) -> List(Subscription),
  perform: fn(Effect, fn(Message) -> Nil) -> Nil,
  actions: Actions,
) -> Nil
