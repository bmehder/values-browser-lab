import { render, nothing, type TemplateResult } from 'lit-html'

// The runtime knows these relationships, not the application's concrete types.
export type Dispatch<Message> = (message: Message) => void
export type Transformation<Model, Effect> = (
  model: Model,
) => readonly [nextModel: Model, effects: Iterable<Effect>]

export type Update<Model, Message, Effect> = (
  message: Message,
) => Transformation<Model, Effect>

// lit-html accepts template descriptions as well as simple display values.
export type ViewDescription = TemplateResult | string | number | boolean
  | null | undefined | typeof nothing

export type View<Model, Message> = (
  model: Model,
  dispatch: Dispatch<Message>,
) => ViewDescription

export type Perform<Effect, Message> = (
  effect: Effect,
  dispatch: Dispatch<Message>,
) => void

export interface Config<Model, Message, Effect> {
  initial: Model
  update: Update<Model, Message, Effect>
  view: View<Model, Message>
  perform?: Perform<Effect, Message>
  target: string
}

export interface App<Message> {
  dispatch: Dispatch<Message>
  refresh: () => void
  dispose: () => void
}

// Iteration stays here so queue draining does not grow the call stack.
const until = <Value>(
  isDone: (value: Value) => boolean,
  step: (value: Value) => Value,
  initial: Value,
): Value => {
  let value = initial
  while (!isDone(value)) value = step(value)
  return value
}

export const start = <Model, Message, Effect>({
  initial, update, view, perform = () => {}, target,
}: Config<Model, Message, Effect>): App<Message> => {
  const root = document.getElementById(target)
  if (!root) throw new Error(`Valuz could not find the mount target #${target}.`)

  let model: Model = initial
  let isProcessing: boolean = false
  let isStopped: boolean = false
  const queue: Message[] = []

  const renderModel = (currentModel: Model): void => {
    render(view(currentModel, dispatch), root)
  }

  const performEffects = (effects: Iterable<Effect>): void => {
    Array.from(effects).forEach(effect => {
      if (!isStopped) perform(effect, dispatch)
    })
  }

  const applyMessage = (message: Message): void => {
    const transformation: Transformation<Model, Effect> = update(message)
    const [nextModel, effects] = transformation(model)
    model = nextModel
    renderModel(nextModel)
    performEffects(effects)
  }

  const isDrained = (messages: Message[]): boolean => isStopped || messages.length === 0
  const applyNextMessage = (messages: Message[]): Message[] => {
    // until checks isDrained first, so this queue is nonempty here.
    const message = messages.shift()!
    applyMessage(message)
    return messages
  }

  // until is stack-safe; immediate responses wait for the current turn.
  const drain = (isRefresh: boolean = false): void => {
    if (isProcessing || isStopped) return
    isProcessing = true
    try {
      if (isRefresh) renderModel(model)
      until(isDrained, applyNextMessage, queue)
    } finally {
      isProcessing = false
    }
  }

  const dispatch: Dispatch<Message> = message => {
    if (isStopped) return
    queue.push(message)
    drain()
  }

  const refresh = (): void => drain(true)
  const dispose = (): void => {
    isStopped = true
    queue.length = 0
    render(nothing, root)
  }

  refresh()
  return { dispatch, refresh, dispose }
}
