# Loader reshape toward PHPNomad

Status: architecture. The interfaces, guards' signatures and
`LoaderException` are final. `Bootstrapper.load()`, `bootstrap()`, the
constructor's normalizing and three type guards are stubs that packet
P1 implements. Every acceptance test is written, and the tests the stubs
cannot pass are marked `test.skip`.

This is slice 7 of the Siren Node commerce connectors build, the loader
half. The registry half lives in the registry repository, in its own
`docs/architecture/ncc-slice-7.md`, on the branch of the same name. It
builds on slice 6, the container and event reshape. The design behind
it is
[Design: Siren Node commerce connectors (Source 16182)](https://navigator.novatori.us/r/source/16182),
and the rule it follows is
[TS Nomad Mirrors PHPNomad (KB 854)](https://navigator.novatori.us/r/kb/854).

## What changes

`Bootstrapper.load()` becomes PHPNomad's
`CanLoadInitializers::loadInitializer`, run for each initializer in
turn. One initializer goes through every step before the next one
starts, which is PHPNomad's order and not 0.1's, where every
initializer bound its definitions before any of them attached
listeners.

```ts
class CoreInitializer implements HasClassDefinitions, HasListeners, HasLoadCondition, Loadable {
  shouldLoad() { return process.env.SIREN_DISABLED !== '1'; }
  getClassDefinitions() { return [[MemoryStore, [Store, 'store']]] as const; }
  getListeners() { return { [OrderPlaced.getId()]: [RecordSale, (e: OrderPlaced) => audit(e)] }; }
  async load() { /* runs last */ }
}

await new Bootstrapper(container, new CoreInitializer(), new PlatformInitializer()).load();
```

The steps, for each initializer:

1. `setContainer(container)`, when it has the method.
2. `shouldLoad()`, when it has the method, awaited. False skips every
   later step for this initializer, and the load moves to the next one.
3. `getClassDefinitions()`. Each `[Concrete, Abstract | Abstract[]]`
   pair goes to `container.bind(Concrete, ...abstracts)`. The 0.1
   record form, `{ token: factory }`, still works, each entry going to
   `container.bind(token, factory)`.
4. `getEventBindings()`. Each `[EventClass, actions]` pair goes to the
   `ActionBindingStrategy`, one `bindAction` call per action. A string
   action passes alone. An `{ action, transformer }` object passes both.
   A 0.1 `{ eventId, listener }` entry is attached to the
   `EventStrategy` as a plain listener.
5. `getListeners()`. Each entry is attached to the `EventStrategy`
   under its event id. A handler class, meaning a function whose
   prototype has a `handle` method, is attached through a listener that
   resolves the class from the container when the event fires and
   calls `handle(event)`. Any other function is attached as it is, at
   the default priority.
6. `getTaskHandlers()`. Each `[TaskClass, Handler | Handler[]]` pair
   goes to the task strategy, as `attach(TaskClass, task =>
   container.get(Handler).then(h => h.handle(task)))`.
7. `getControllers()`. Each controller class goes to the REST strategy,
   as `registerRoute(() => container.get(Controller))`.
8. `load()`, awaited.

The strategies are read from the container: `EventStrategy` and
`ActionBindingStrategy` by the event package's tokens, and the task and
REST strategies by the string keys `'TaskStrategy'` and
`'RestStrategy'`. Each is resolved once per step, and only when that
step has at least one entry for it. A step checks the shape of its
whole answer before it binds or attaches anything, so a malformed
answer registers nothing from that step. A strategy call's promise is
awaited, and its errors pass through.

`HasLoadCondition` is new. `HasEventBindings`, `HasTaskHandlers` and
`HasControllers` are new as PHPNomad shapes. `HasListeners` and
`HasEventBindings` are the event package's own types, re-exported, and
`CanSetContainer` is the container package's, re-exported.
`BaseInitializer.setContainer` returns `this`, as that interface asks.

### Errors

`LoaderException(initializer, position, cause)` names the initializer
by its constructor name, or `anonymous initializer` for a plain object,
and its position in the list, counting from 1. The message is
`Failed to load <name> (position <n>): <cause message>`.

- A `DiException` from any step, `load()` included, stops the load and
  rejects with a `LoaderException` whose cause is that same error.
- A wrong shape rejects the same way, with a `TypeError` as the cause:
  `shouldLoad()` answering anything but a boolean, a list method
  answering anything but an array, a pair of the wrong length, an entry
  that is not a class where a class belongs.
- Every other error passes through unchanged and stops the load. This
  covers an initializer's own methods and the strategies.
- An error raised later, when a handler, task handler or controller is
  resolved on use, reaches whoever triggered the use: the broadcast,
  the task strategy, or the REST strategy.

PHPNomad wraps only `DiException`. The shape errors are wrapped because
they belong to the load, and a caller needs to know which initializer
gave the bad answer.

### Ports for slice 8

`src/ports.ts` declares the two shapes the loader calls,
`LoaderTaskStrategy.attach(taskClass, handler)` and
`LoaderRestStrategy.registerRoute(getController)`, plus the task and
controller class shapes. Slice 8 writes `@tsnomad/tasks` and
`@tsnomad/rest`. Their strategies must stay assignable to these ports,
and the compile-only test pins that. When those packages land, the
loader may import their types and keep the ports as aliases.

### 0.1 entry points that stay

- The constructor takes one array, `new Bootstrapper(container, [a,
  b])`, as well as separate arguments.
- `bootstrap(options)` runs `load()` and reads the event strategy by
  `options.eventStrategyToken` when given. It is deprecated, as are
  `EVENT_STRATEGY_TOKEN` and `BootstrapOptions`.
- The record form of class definitions, and the record of plain
  functions for listeners.

## What breaks for 0.1 consumers

The consumer check in packet P3 measures each of these against the
five consumers, and the fix patches carry only these changes.

- A later initializer's bindings are not there during an earlier
  initializer's `load()`. In 0.1 every initializer bound before any
  loaded. A handler class resolved on broadcast still sees every
  binding, since that runs after the whole load.
- Listeners with no event strategy bound now fail the load, with a
  `LoaderException` whose cause is the container's
  `BindingNotFoundError`. 0.1 skipped them in silence.
- `implements CanSetContainer` on a class whose `setContainer` returns
  void no longer compiles, because the interface is now the container
  package's, which returns `this`. A class that does not name the
  interface is still accepted, since `Initializer` takes any return.
- The name `HasEventBindings` now means the event package's pair
  shape. A class typed against the 0.1 loader interface keeps
  compiling only if its entries are `{ eventId, listener }` objects,
  which the new type also accepts.

## Decisions

The assumptions log records each call, A220 to A239. The short
version:

- Order is PHPNomad's, per initializer, with `setContainer` before
  `shouldLoad`, as PHPNomad has it.
- `shouldLoad` may be async and must answer a boolean.
- Handler classes are resolved when used, never during load, as
  PHPNomad's closures do.
- Strategies resolve lazily, once per step, which lets an initializer
  with an empty list load with no strategy bound.
- The package version stays 0.1.0 on this branch, as the brief says.
  The version call belongs to the merge to main.

## Packets

- P1, `Bootstrapper` (`src/Bootstrapper.ts`, the three stub guards in
  `src/interfaces.ts`). It owns `load()`, `bootstrap()`, the
  constructor's normalizing and the shape checks.
- P3, the consumer check across the five consumers, pinning
  di-container, event, loader and registry.

The registry repository's note covers P2.

## Proof

`ncc-slice-7-proof/` holds the mutation lists and logs. Each list ran
against a scratch implementation in a separate clone that is never
committed, with every `skip` removed. Every guard has one mutation, and
each run starts with three controls. See that folder's README.
