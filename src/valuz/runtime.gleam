// Generic coordinator. Application decisions and platform adapters are supplied.
import gleam/list

pub type Config(model, message, effect, view) {
  Config(
    initial: model,
    update: fn(message) -> fn(model) -> #(model, List(effect)),
    view: fn(model) -> view,
    present: fn(view) -> Nil,
    perform: fn(effect, fn(message) -> Nil) -> Nil,
  )
}

pub type Runtime(message) {
  Runtime(dispatch: fn(message) -> Nil, refresh: fn() -> Nil, stop: fn() -> Nil)
}

// Two lists make a FIFO queue without repeatedly appending to a list.
type State(model, message) {
  State(
    model: model,
    waiting: List(message),
    incoming: List(message),
    processing: Bool,
    stopped: Bool,
  )
}

// Only reference storage and exception cleanup require JavaScript primitives.
type Reference(value)

@external(javascript, "./runtime_ffi.mjs", "reference")
fn reference(value: value) -> Reference(value)

@external(javascript, "./runtime_ffi.mjs", "read")
fn read(reference: Reference(value)) -> value

@external(javascript, "./runtime_ffi.mjs", "write")
fn write(reference: Reference(value), value: value) -> Nil

@external(javascript, "./runtime_ffi.mjs", "with_cleanup")
fn with_cleanup(work work: fn() -> Nil, cleanup cleanup: fn() -> Nil) -> Nil

pub fn create(
  config: Config(model, message, effect, view),
) -> Runtime(message) {
  let state =
    reference(State(
      model: config.initial,
      waiting: [],
      incoming: [],
      processing: False,
      stopped: False,
    ))
  Runtime(
    dispatch: fn(message) { dispatch(state, config, message) },
    refresh: fn() { run(state, config, refresh: True) },
    stop: fn() {
      write(
        state,
        State(..read(state), stopped: True, waiting: [], incoming: []),
      )
    },
  )
}

fn dispatch(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, view),
  message: message,
) -> Nil {
  let current = read(state)
  case current.stopped {
    True -> Nil
    False -> {
      write(state, State(..current, incoming: [message, ..current.incoming]))
      run(state, config, refresh: False)
    }
  }
}

fn publish(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, view),
) -> Nil {
  let model = read(state).model
  config.present(config.view(model))
}

fn run(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, view),
  refresh refresh: Bool,
) -> Nil {
  let current = read(state)
  case current.processing || current.stopped {
    True -> Nil
    False -> {
      write(state, State(..current, processing: True))
      with_cleanup(
        work: fn() {
          case refresh {
            True -> publish(state, config)
            False -> Nil
          }
          drain(state, config)
        },
        cleanup: fn() { write(state, State(..read(state), processing: False)) },
      )
    }
  }
}

fn drain(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, view),
) -> Nil {
  let current = read(state)
  case current.stopped, current.waiting, current.incoming {
    True, _, _ -> Nil
    False, [], [] -> Nil
    False, [], incoming -> {
      write(
        state,
        State(..current, waiting: list.reverse(incoming), incoming: []),
      )
      drain(state, config)
    }
    False, [message, ..rest], _ -> {
      write(state, State(..current, waiting: rest))
      apply_message(state, config, message)
      drain(state, config)
    }
  }
}

// Finish one decision before queued responses are allowed to begin another.
fn apply_message(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, view),
  message: message,
) -> Nil {
  let current_model = read(state).model
  let operation = config.update(message)
  let #(next_model, effects) = operation(current_model)
  write(state, State(..read(state), model: next_model))
  publish(state, config)
  perform_effects(state, config, effects)
}

fn perform_effects(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, view),
  effects: List(effect),
) -> Nil {
  case read(state).stopped, effects {
    True, _ -> Nil
    False, [] -> Nil
    False, [effect, ..rest] -> {
      config.perform(effect, fn(message) { dispatch(state, config, message) })
      perform_effects(state, config, rest)
    }
  }
}
