# The Value of Values

*How describing what happens can make an application easier to understand.*

A 30-minute conference talk about Valuz, an emerging framework experiment in Gleam and JavaScript. This is the full spoken script, with static visuals and suggested timings. Allow time to look at the diagrams and read the code; the timings are rehearsal targets, not a measured recording.

[Try the app](/) · [Read the guide](guide.md) · [Keep the quick reference nearby](reference.md)

*Select any diagram to open it at full size. [Open the whole-app map](visuals/whole-app.svg) whenever you need your bearings.*

## 1. The problem is keeping the whole thing in your head

*00:00–03:00 · Visual 1: The whole app*

[![A message selects an operation. Applying the operation to the current model produces the next model and effect descriptions. The runtime retains that model, renders the screen, maintains subscriptions, and performs effects. Browser outcomes return as messages.](visuals/whole-app.svg)](visuals/whole-app.svg)

I want to start with a fairly ordinary programming problem. You open a project you haven't seen for a while. There is a model file, an update function, some rendering code, a browser adapter, and a collection of helpers. Every file makes sense when you read it. Somehow, the application doesn't.

You can understand the individual sentences without knowing what the conversation is about.

That is the problem I want to work on today. How do we make a program easier to approach? How do we make its structure visible enough that we can leave, come back two months later, and find our way around?

Our example is a small browser application. You can search Hacker News, save a query, restore it, copy it, read the time, and start a timer. These features are deliberately modest. We need enough contact with the outside world to encounter real problems, while keeping the program small enough to examine.

The project is called Valuz. Calling it an emerging framework is an invitation to investigate the design, rather than a claim that we have finished a general-purpose library. At the moment, it is an application with a small, explicit coordinator and some relationships worth exploring.

Here is the whole application on one picture. Something happens. We represent it as a message. That message selects an operation. The operation receives the current model and produces a new model alongside descriptions of requested work. A coordinator retains the new model and connects those descriptions to the browser. Results come back as more messages.

Keep that picture in mind. Every file we open will have an address on it.

We will spend most of the talk following a single search. By the end, you should be able to point at any part of the application and answer two questions: what decision belongs here, and what happens next?

The larger idea is that values can do more than hold the information our program happens to manipulate. Values can help us describe the program itself. They can give decisions, intentions, and transitions a form we can inspect before anything happens.

That sounds philosophical. Let's make it useful.

## 2. A program can be a value

*03:00–05:30 · Visual 2: Meaning and execution*

[![A pure operation is a function value. An effect description is a data value. Execution applies the function and interprets the data; the resulting interaction with the world is a separate event.](visuals/values-and-execution.svg)](visuals/values-and-execution.svg)

Consider a function that adds one to a number. We can call it, but we can also pass it to another function, store it, or choose it conditionally. Before we apply it, it is already something we can work with.

A pure function describes a relationship between inputs and outputs. Given the same input, it has the same result, without changing the outside world. In that sense, a pure program can be understood as a value: a function value describing the computation. That is a claim about its meaning, not about how much time or memory execution requires.

Now we meet the browser. We want to fetch stories, save text, and ask what time it is. Those operations depend on the world. The same request may fail tomorrow. Reading the clock twice can produce different answers. Saving a query changes something outside the function.

We cannot make those differences disappear by choosing better syntax.

But we can distinguish an instruction from its execution. “Save this query” can be a value before it becomes a storage write. “Search for these words” can be a value before it becomes a network request. We can examine the instruction, log it, test that we chose it, or interpret it in a different environment.

That distinction gives us room to think. We can decide what should happen without immediately doing it.

There is a qualification here that matters throughout the talk. An effect description is a value. The event that changes the world is still an event. When I say that an effectful program can have a value representation, I mean that its instructions and continuations can be represented as values and functions. I am not claiming that the network has become pure.

In this app, the representation has two pieces: pure transitions that choose what comes next, and effect values that describe requested interactions. An interpreter and a coordinator give those descriptions their operational meaning.

The payoff is practical. We get a place to read the decision before following the mechanism.

## 3. Give the application a vocabulary

*05:30–08:00 · Visual 3: State with names*

[![Search state has four alternatives: ready, searching with request identity and query, succeeded with query and stories, or failed with query and reason. Each alternative carries the information it needs.](visuals/search-states.svg)](visuals/search-states.svg)

Let's open [model.gleam](../src/model.gleam). This file establishes the language the application speaks.

A search can be ready, in progress, successful, or failed. We give those alternatives names and attach the relevant information to each one:

```gleam
pub type SearchState {
  SearchReady
  Searching(request: SearchRequestId, query: SearchQuery)
  SearchSucceeded(query: SearchQuery, stories: List(Story))
  SearchFailed(query: SearchQuery, reason: FailureReason)
}
```

Compare that with a loading flag, an error string, a results list, and a few conventions we need to remember. Can loading and failed both be true? Does an empty results list mean we haven't searched, or that nothing matched? Does the error belong to the latest query?

The named alternatives answer some of those questions in the structure. A failed search contains its reason. A running search contains its request identity. Success carries the query that produced those stories.

This does not make every invalid condition impossible. Public constructors and foreign JavaScript still deserve attention. It does reduce the number of things the reader must infer from neighboring fields.

The same approach explains types such as `Clock`, `Timer`, and `StorageState`. They belong to the example application's features. They are not requirements imposed on every application by Valuz. The clock is here to demonstrate one-time readings and ongoing subscriptions, rather than to make search work.

That distinction helps when the model starts looking large. Some names describe the architecture. Other names describe the application we chose to build with it. We should be able to separate those responsibilities in our heads even when they share a file.

We also have names such as `SearchRequestId`, `Milliseconds`, and `StoryTitle`. These give primitive values a role. A duration and a request identifier may both contain an integer, but they are different things in the conversation.

Good names reduce translation. If I can read the model and recognize the concepts the application cares about, I have already learned something useful before studying a single algorithm.

The model becomes the vocabulary. Messages become the sentences.

## 4. A message chooses an operation

*08:00–10:30 · Stay with Visual 1*

Open [domain.gleam](../src/domain.gleam). This is the application's table of intentions. Here is a shortened excerpt:

```gleam
case message {
  UserSubmittedSearch -> operations.begin_search()
  UserRequestedDraftSave -> operations.save_draft()
  UserRequestedTime -> operations.request_time()
  HttpReturnedSearchResult(request, result) ->
    operations.receive_search_result(request, result)
  // Other messages follow the same pattern.
}
```

Read the first line aloud. The user submitted a search; begin the search. The name on the left describes what we observed. The name on the right describes the operation we choose in response.

That distinction is why the save message says `UserRequestedDraftSave`. The user clicking a button does not establish that storage accepted the write. A later message reports the result. Our vocabulary should preserve that uncertainty.

There is something else unusual here. `update` receives a message and returns an operation. It doesn't receive the model yet.

```gleam
pub type Operation =
  fn(Model) -> #(Model, List(Effect))
```

An operation is a function waiting for the current model. Applying it produces a pair: the next model and a list of effect descriptions. There is no hidden execution inside this type.

We could put the transition logic directly in the message branches. Moving it into named operations gives the update table a particular purpose: it tells us what the application does in response to its messages. When we need the details, we follow the function.

That is a navigation aid, not a universal rule that every branch must move to another file. For this experiment, it makes a useful separation between choosing an operation and understanding how it calculates the next turn.

The real update function also wraps the chosen operation with activity recording. That wrapper applies the operation, records the incoming message alongside its requested effects, and returns the resulting pair. It doesn't perform those effects.

We can wrap an operation because the operation is a value. We can add observation around it without rewriting every decision. The design is already earning the philosophy.

## 5. Follow one search through the decision

*10:30–13:30 · Visual 4: One search, two turns*

[![Turn one: UserSubmittedSearch selects begin_search, producing Searching with request 7 and a SearchService effect. Turn two: the browser returns HttpReturnedSearchResult for request 7, selecting receive_search_result and producing SearchSucceeded or SearchFailed.](visuals/search-journey.svg)](visuals/search-journey.svg)

Now open [operations.gleam](../src/operations.gleam). The user has typed a query and pressed Search. What should happen?

First, the operation prepares the draft query. Preparation trims whitespace and rejects an empty result. If preparation fails, the operation returns a ready search state and no effects. An empty query never becomes a request simply because the button was clicked.

If preparation succeeds, the operation constructs two related values. The next search state says that this request is in progress. The effect list asks the browser to search using the same request identity and prepared query. It also advances the counter for the next request.

Nothing has gone over the network yet. We have described the next turn.

This is where the model-and-effect pair matters. The visible state and the requested work come from one decision. We are not independently toggling a spinner and starting a fetch in unrelated parts of an event handler. We can inspect the relationship between the two outputs.

A useful test can apply `begin_search()` to a known model and inspect the pair. Does the state contain the prepared query? Does the effect carry the same identity? Does a blank draft produce an empty effect list? None of those questions requires an internet connection.

When the network result eventually arrives, it is a new message and therefore a new turn. `receive_search_result` looks at the current model, rather than the model that happened to exist when the request began.

That detail handles an ordinary race. Suppose I search for Gleam, then immediately search for types. The first request is slow. The second request completes first. We do not want the older result to overwrite the newer one.

Our model remembers the active request identity. The response operation accepts a result only when that identity matches. An obsolete response leaves the domain state unchanged, although the activity wrapper can still record that the message arrived.

The network is allowed to complete out of order. The application decides which completion still matters.

That is an example of policy living in the pure part of the program. We can test it by supplying messages in an inconvenient order. We don't need to make a real server slow enough to reproduce the race.

Look again at the diagram. One button click didn't produce one enormous function call. It started a conversation across two explicit turns. Between them, the browser did something uncertain.

## 6. Where the effects actually happen

*13:30–16:30 · Visual 5: The boundary*

[![Gleam owns typed effect descriptions and outcome messages. The effect interpreter calls JavaScript adapters. The adapters contact the browser and validate incoming service data with Valibot before constructing Gleam values and returning an outcome message.](visuals/browser-boundary.svg)](visuals/browser-boundary.svg)

Open [effects.gleam](../src/effects.gleam). This is the interpreter. It matches on an effect value and calls the appropriate browser adapter. A `SearchService` value becomes a call to the search function. A `SaveDraft` value becomes a storage write.

The interpreter supplies callbacks that translate browser outcomes into application messages. A search result becomes `HttpReturnedSearchResult`. A storage write becomes `StorageReturnedSaveResult`. The interpreter doesn't decide whether an old search result should replace a new one; we have already given that decision a home.

The browser mechanisms live in [browser.mjs](../src/browser.mjs). This file knows about fetch, clipboard access, local storage, dates, and timeouts. It also knows how to validate the external search response and construct the values expected by Gleam.

That last step is important. A successful HTTP status is not proof that the response contains stories. JSON parsing is not proof either. We use a Valibot schema to check the shape before building `Story` values. The compiler's guarantees do not extend backward into arbitrary data supplied by a server.

The JavaScript uses native promise chains and selected Ramda helpers. Here is the search entry point:

```js
export const search = (query, success, failure) =>
  fetchStories(query, new AbortController())
    .then(success, pipe(searchFailure, failure))
```

We originally explored a more elaborate JavaScript abstraction. We kept that experiment in Git, then made the active version easier to read. Later we brought back a few useful compositions without restoring the extra execution layer.

That history exposes a useful test for an abstraction: does it make the next step easier to see? A pipeline can help. A new vocabulary can also become another thing the reader must decode.

Ramda and Valibot are implementation choices. They are not the definition of Valuz. We could change the browser implementation while keeping the same typed effects and messages.

There is a small detail in the promise chain worth preserving. Success and failure are sibling handlers. If application code throws while handling a successful response, that exception does not get reported as a second, failed network result. Our tests protect that distinction.

We still have real uncertainty: denied clipboard access, unavailable storage, malformed responses, and timeouts. The design gives those outcomes a route back into the application. It does not promise to prevent them.

## 7. The little machine that connects the pieces

*16:30–19:30 · Return to Visual 1*

Now open [runtime.mjs](../src/runtime.mjs). If the previous files describe the conversation, this file keeps it moving.

The coordinator holds the current model and a queue of messages. For each message, it asks update for an operation, applies that operation to the current model, and receives the next model and effects. The center of the loop looks like this:

```js
const [nextModel, effects] = update(queue.shift())(model)
model = nextModel
render(view(model))
reconcile(subscriptions(model))
for (const effect of effects) perform(effect, dispatch)
```

These lines are an excerpt from the processing loop, not a standalone implementation. But the order is the important part: calculate, retain, project, reconcile, perform.

Why retain the next model before performing an effect? Because an effect can report back immediately. Storage is synchronous in this implementation. Reading the time is synchronous too. If those results observed the previous model, our neat diagram would describe an ordering the application didn't actually follow.

The queue handles that case. A callback adds its message to the queue. A processing guard keeps it from starting a nested update while the current turn is still running. Once the current turn finishes, the next queued message gets its turn with the retained model.

The coordinator has mutable variables. It changes the current model reference, manages an interval handle, and drains a queue. We have not turned the browser into a pure evaluator. We have made the stateful coordination small enough to inspect and given it a narrow responsibility.

This is also where the application's scope shows. The renderer knows specific element IDs. Subscription handling knows about our live clock. The coordinator is useful and understandable, but parts of it are still coupled to this example.

An emerging framework would have work to do here: define a broader rendering boundary, describe more subscription kinds, and establish lifecycle behavior beyond the current page. Those are future design problems, not capabilities we should imply already exist.

For today, the mechanism is visible. There is no mysterious second application hiding beneath the application. There is a queue, a model, a few functions, and an explicit order.

## 8. The screen is another answer derived from values

*19:30–21:30 · Visual 6: One model, two descriptions*

[![The same model feeds view, producing a screen description, and subscriptions, producing a description of ongoing inputs. Rendering updates the DOM; reconciliation starts or stops the live clock interval.](visuals/projections.svg)](visuals/projections.svg)

Open [presentation.gleam](../src/presentation.gleam). The model contains application concepts. The screen needs words, links, and display choices. Presentation translates between them.

A failed search becomes a heading and a reason. A running timer becomes “Waiting for the browser…” and a restart label. The JavaScript renderer receives a screen description rather than independently interpreting domain states.

Even the activity text is a small transformation:

```gleam
effects
|> list.map(effect_name)
|> string.join(", ")
```

The interesting part is the direction. We start with effect values, give each one a display name, then join the names. The syntax follows the journey of the data.

Presentation also describes subscriptions. When the clock mode is live, subscriptions returns `[EverySecond]`. When it is manual, it returns `[]`. The function does not start an interval. It states which ongoing input the current model wants.

The coordinator compares that description with the interval it maintains. It starts or stops the browser mechanism as needed. Clock ticks return as messages, just like search results.

A one-time effect says, “Do this.” A subscription says, “While this state calls for it, keep listening.” Both can have value descriptions, although they need different management over time.

This is why we included a clock in a search demonstration. It lets us ask whether the architecture can describe both a single request and an ongoing relationship with the environment.

The picture now has two projections from the same model: what should the screen show, and which ongoing inputs should exist? Both are questions a pure function can answer.

## 9. Types can record what we have established

*21:30–23:30 · Visual 7: A query earns its next type*

[![An input string becomes Query Unchecked. Preparation trims it and either returns EmptyQuery or produces Query Searchable. SearchService accepts the Searchable stage. No stage marker is stored at runtime.](visuals/query-stages.svg)](visuals/query-stages.svg)

One more file: [query.gleam](../src/query.gleam). It illustrates a way to make a relationship visible to the compiler as well as to the reader.

A draft query is unchecked. After preparation, it may be searchable. These are stages of the same opaque query type:

```gleam
pub opaque type Query(stage) {
  Query(String)
}

pub type Unchecked
pub type Searchable
```

The stage parameter is phantom. It appears in the type, but the stored value is just the query string. We don't construct an `Unchecked` object and attach it to the query.

`from_input` produces `Query(Unchecked)`. `prepare` trims that value and returns either an error or `Query(Searchable)`. The effect constructor for searching requires the searchable stage.

The constructor is private. That is what makes this more than a label someone can casually attach. Within checked Gleam code, callers need to go through the preparation API to obtain a searchable query.

This proves something specific: the query passed through this preparation rule. It does not prove that the server will accept it, that a network exists, or that a result will arrive. A type should tell the truth about what we have established.

We can explain the whole mechanism without asking the reader to learn a new runtime system. The types remember a step in the story that would otherwise live in a comment: prepare this before searching.

That is another use of values and types to lower the reader's memory burden. Instead of remembering an ordering convention everywhere, we give the relationship an explicit home.

## 10. How to find your way back into the app

*23:30–26:00 · Return to Visual 1; keep this map nearby*

We have opened quite a few files. Let's turn that collection back into a map.

| Question | Start here | Follow next |
|---|---|---|
| What can the app know or receive? | [model.gleam](../src/model.gleam) | The relevant named state or message |
| What does this message mean? | [domain.gleam](../src/domain.gleam) | Its operation in [operations.gleam](../src/operations.gleam) |
| Why did this transition request work? | [operations.gleam](../src/operations.gleam) | The effect value it returns |
| How does that work reach the browser? | [effects.gleam](../src/effects.gleam) | Its adapter in [browser.mjs](../src/browser.mjs) |
| Who runs the next turn? | [runtime.mjs](../src/runtime.mjs) | The queue and dispatch loop |
| Why does the screen say that? | [presentation.gleam](../src/presentation.gleam) | Its `Screen` projection |
| Where are the parts connected? | [main.gleam](../src/main.gleam) | The functions supplied to `start` |

You don't need to begin by reading every file from top to bottom. Start with the kind of question you have.

If you are adding a feature, describe its conversation first. What can the user request? What information must the model retain? What effect could be needed? What message reports the outcome? Only then decide which browser API will carry it out.

Suppose we add a location feature. We would need an explicit request, a description of the operation, a result message, and states that represent waiting, success, and failure. The browser permission prompt would belong to the mechanism. The application would still decide what each outcome means. This is a sketch of an extension, not a feature currently present.

The pattern gives us a place to ask those questions before writing the adapter. It also exposes questions we haven't answered: should a second request replace the first, can the user cancel, and which result still matters?

That is how the architecture helps us solve a problem. It encourages us to define the possible conversation rather than scatter reactions across event handlers and hope they fit together.

The files are places to look, not steps to memorize. The journey through the system stays the same even when a feature touches several of them.

## 11. What is emerging, and what still needs work?

*26:00–28:00 · Visual 2 again*

The useful core of Valuz is a set of relationships: messages select pure operations, operations produce models and effect descriptions, presentation derives the screen and subscriptions, and a coordinator interprets those descriptions over time.

Those relationships are familiar territory in functional application design. The experiment here is to make them legible in this particular arrangement and see how far a small implementation can go. We don't need to claim a new computational discovery to find value in a clearer program.

We should also be honest about the present implementation. The model includes this application's example features. The renderer is tied to its HTML. The subscription manager handles the clock. There is no general cancellation system, persistent history, or production-grade replay tool hiding behind the activity panel.

The activity log records recent messages and requested effects. It helps us inspect the conversation. It is not automatically a complete replay facility: external outcomes, initial conditions, and interpretation choices all matter. A useful next tool would need to specify exactly what it records and what replay means.

Tests already benefit from the separation. We can test pure decisions directly and exercise browser adapters with controlled responses. We can check that storage failure reports once, that stale search results are ignored, and that callback bugs aren't misreported as external failures.

Those are concrete benefits today. Generalizing the runtime and packaging a reusable API should be driven by additional applications. Otherwise we risk building a framework around the accidental shape of one demonstration.

The question for an emerging framework is whether its boundaries continue to help as the application changes. We now have boundaries clear enough to investigate.

## 12. The value of values

*28:00–30:00 · Visual 1, one last time*

We began with a project whose files were individually understandable and collectively difficult to hold in mind.

Our answer was to give the conversation a visible shape. A message says what happened. An operation says how the application responds. A model says what it currently knows. An effect says what work it requests. A screen says what to show. A subscription says what to keep listening for.

Each of those descriptions gives us something we can name and inspect. Several are ordinary data values. An operation is a function value. Together they form a program description that a small runtime can carry forward.

This does not remove every hard problem. The browser still has permissions. Networks still fail. Requests still race. We still need to understand the coordinator, and we still have to choose good models. The advantage is that those concerns have places to live and routes by which they meet.

That changes how we read. We can ask what should happen without immediately studying how fetch works. We can inspect the requested effect without performing it. We can test an awkward sequence of outcomes without arranging an awkward real-world situation.

And it changes how we return. After a month away, we have a map: vocabulary, decisions, descriptions, interpretation, outcomes. We can find the next relevant piece rather than rebuild the whole application in our heads.

So can an impure program still be a value? It can have a value representation: pure functions describing its decisions, data describing its effects, and functions describing what to do with the results. Executing that representation still requires a world-facing interpreter. The representation is valuable precisely because we can reason about it before that interaction occurs.

That is the ambition of Valuz. Make the program's meaning easier to see. Keep the mechanism understandable. Let the next step follow from a description we can read.

We wanted programming to be easier. Values give us something concrete to work with.

---

*For a second pass: open the [full guide](guide.md), choose one control in the [app](/), and follow its message around the whole-app diagram. The [quick reference](reference.md) is the file map you can keep beside the source.*
