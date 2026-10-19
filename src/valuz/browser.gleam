// The standard lit-html browser starter. Application choices are supplied once.
import valuz/runtime.{type Runtime}

// A lit-html template value created by the application's JavaScript view.
pub type Template

pub type Config(model, message, effect, screen) {
  Config(
    initial: model,
    update: fn(message) -> fn(model) -> #(model, List(effect)),
    presentation: fn(model) -> screen,
    view: fn(screen, model, fn(message) -> Nil) -> Template,
    perform: fn(effect, fn(message) -> Nil) -> Nil,
    target: String,
  )
}

pub type BrowserApp

pub fn start(config: Config(model, message, effect, screen)) -> BrowserApp {
  mount(
    create_runtime: fn(present) { create_runtime(config, present) },
    view: fn(frame, dispatch) {
      let #(screen, model) = frame
      config.view(screen, model, dispatch)
    },
    root_id: config.target,
  )
}

// Assemble the runtime with the browser presenter.
pub fn create_runtime(
  config: Config(model, message, effect, screen),
  present: fn(#(screen, model)) -> Nil,
) -> Runtime(message) {
  runtime.create(runtime.Config(
    initial: config.initial,
    update: config.update,
    view: fn(model) { #(config.presentation(model), model) },
    present: present,
    perform: config.perform,
  ))
}

@external(javascript, "./browser_ffi.mjs", "mount")
fn mount(
  create_runtime create_runtime: fn(fn(#(screen, model)) -> Nil) ->
    Runtime(message),
  view view: fn(#(screen, model), fn(message) -> Nil) -> Template,
  root_id root_id: String,
) -> BrowserApp
