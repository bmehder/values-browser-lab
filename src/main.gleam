import app/effects
import app/model.{type Message, type Model}
import app/presentation.{type Screen}
import app/update
import valuz/browser

pub fn main() -> Nil {
  let _ =
    browser.start(browser.Config(
      initial: model.initial(),
      update: update.update,
      presentation: presentation.describe,
      view: view,
      perform: effects.perform,
      target: "app",
    ))
  Nil
}

@external(javascript, "./app/view.mjs", "appView")
fn view(
  screen: Screen,
  model: Model,
  dispatch: fn(Message) -> Nil,
) -> browser.Template
