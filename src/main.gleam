import app/effects
import app/model.{type Effect, type Message, type Model, type Operation}
import app/presentation.{type Screen}
import app/update

// Typed application inputs for the JavaScript runtime.
type Config {
  Config(
    initial: Model,
    update: fn(Message) -> Operation,
    view: fn(Model, fn(Message) -> Nil) -> Template,
    perform: fn(Effect, fn(Message) -> Nil) -> Nil,
    target: String,
  )
}

type Template

type App

pub fn main() -> Nil {
  let _ =
    start(Config(
      initial: model.initial(),
      update: update.update,
      view: fn(model, dispatch) {
        view(presentation.describe(model), model, dispatch)
      },
      perform: effects.perform,
      target: "app",
    ))
  Nil
}

@external(javascript, "./valuz/runtime.mjs", "start")
fn start(config: Config) -> App

@external(javascript, "./app/view.mjs", "appView")
fn view(screen: Screen, model: Model, dispatch: fn(Message) -> Nil) -> Template
