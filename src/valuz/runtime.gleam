// Generic coordinator. Application decisions and platform adapters are supplied.
import gleam/list

pub type Config(model, message, effect, subscription, view) {
  Config(
    initial: model,
    update: fn(message) -> fn(model) -> #(model, List(effect)),
    view: fn(model) -> view,
    subscriptions: fn(model) -> List(subscription),
    present: fn(view) -> Nil,
    reconcile: fn(List(subscription), fn(message) -> Nil) -> Nil,
    perform: fn(effect, fn(message) -> Nil) -> Nil,
    observe: fn(model) -> Nil,
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
fn with_cleanup(work: fn() -> Nil, cleanup: fn() -> Nil) -> Nil

pub fn create(
  config: Config(model, message, effect, subscription, view),
) -> Runtime(message) {
  let state = reference(State(config.initial, [], [], False, False))
  Runtime(
    dispatch: fn(message) { dispatch(state, config, message) },
    refresh: fn() { run(state, config, True) },
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
  config: Config(model, message, effect, subscription, view),
  message: message,
) -> Nil {
  let current = read(state)
  case current.stopped {
    True -> Nil
    False -> {
      write(state, State(..current, incoming: [message, ..current.incoming]))
      run(state, config, False)
    }
  }
}

fn publish(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, subscription, view),
) -> Nil {
  let model = read(state).model
  config.present(config.view(model))
  config.observe(model)
  config.reconcile(config.subscriptions(model), fn(message) {
    dispatch(state, config, message)
  })
}

fn run(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, subscription, view),
  refresh: Bool,
) -> Nil {
  let current = read(state)
  case current.processing || current.stopped {
    True -> Nil
    False -> {
      write(state, State(..current, processing: True))
      with_cleanup(
        fn() {
          case refresh {
            True -> publish(state, config)
            False -> Nil
          }
          drain(state, config)
        },
        fn() { write(state, State(..read(state), processing: False)) },
      )
    }
  }
}

fn drain(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, subscription, view),
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
      let operation = config.update(message)
      let #(next_model, effects) = operation(current.model)
      write(state, State(..read(state), model: next_model))
      publish(state, config)
      perform_effects(state, config, effects)
      drain(state, config)
    }
  }
}

fn perform_effects(
  state: Reference(State(model, message)),
  config: Config(model, message, effect, subscription, view),
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
