# Loader reshape toward PHPNomad

Status: architecture. The interfaces, the type guards' signatures and
`LoaderException` are final. `Bootstrapper.load()`, `bootstrap()`, the
constructor's normalizing and three type guards are stubs. Packet P1,
the implementation task for the bootstrapper, fills them in. Every
acceptance test is written, and the tests the stubs cannot pass carry
`test.skip`.

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
  getListeners() { return { [OrderPlaced.getId()]: RecordSale }; }
  async load() { /* runs last */ }
}

await new Bootstrapper(container, new CoreInitializer(), new PlatformInitializer()).load();
```

The steps, for each initializer:

1. `setContainer(container)`, when it has the method.
2. `shouldLoad()`, when it has the method, awaited. False skips every
   later step for this initializer, and the load moves to the next one.
   The skip is designed control flow, so nothing is logged or thrown.
3. `getClassDefinitions()`. Each `[Concrete, Abstract | Abstract[]]`
   pair goes to `container.bind(Concrete, ...abstracts)`. The 0.1
   record form, `{ token: factory }`, still works, each entry going to
   `container.bind(token, factory)`.
4. `getEventBindings()`. For each `[EventClass, actions]` pair the
   bootstrapper resolves the `ActionBindingStrategy` and makes one
   `bindAction` call per action. A string action passes alone. An
   `{ action, transformer }` object passes both. The bootstrapper
   attaches a 0.1 `{ eventId, listener }` entry to the `EventStrategy`
   as a plain listener.
5. `getListeners()`. The bootstrapper resolves the `EventStrategy`,
   then attaches each entry under its event id. It sorts each entry by
   two checks, in this order:
   - A function whose `prototype.handle` is a function is a handler
     class, whether written with `class` or as an ES5 constructor. The
     bootstrapper attaches a listener that resolves the class from the
     container when the event fires and calls `handle(event)`.
   - A function whose source, read with `Function.prototype.toString`,
     starts with `class` is a class with no `handle` method, a wrong
     shape. That covers a class whose `handle` is an instance field,
     since a field is not on the prototype.
   - Any other function is a plain listener, attached as it is, at the
     default priority.
6. `getTaskHandlers()`. The bootstrapper resolves the task strategy,
   then attaches each `[TaskClass, Handler | Handler[]]` pair as
   `attach(TaskClass, task => container.get(Handler).then(h =>
   h.handle(task)))`. That function rejects with whatever the resolve
   or `handle` threw, unchanged.
7. `getControllers()`. The bootstrapper resolves the REST strategy,
   then calls `registerRoute(() => container.get(Controller))` for each
   controller class.
8. `load()`, awaited.

Steps 5 to 7 resolve their strategy as soon as the initializer has the
method, before they read the list, as PHPNomad does. An initializer
with the method needs the strategy bound even when its list is empty,
and with no strategy bound the load fails before the method runs, so a
missing strategy is reported ahead of a malformed answer. A task
handler and a controller must be classes, with a prototype, and a task
handler's prototype must have `handle`.
Step 4 resolves its strategy per pair, also as PHPNomad does, so an
empty list needs none. The bootstrapper reads `EventStrategy` and
`ActionBindingStrategy` by the event package's tokens, and the task and
REST strategies by the string tokens `'TaskStrategy'` and
`'RestStrategy'`. It checks the shape of a step's whole answer before
it binds or attaches anything, so a malformed answer registers nothing
from that step. It awaits a strategy call's promise and lets its errors
pass through. A strategy that throws on one entry stops the step there,
and the entries it took before stay registered.

A failed load is not rolled back. What earlier initializers and earlier
steps registered stays in the container and the strategies. `load()`
does not remember an earlier call either. Calling it again runs every
step again, so a retry into the same container fails at the first
binding the container already holds. To recover, build a new container
and load into it.

`HasLoadCondition` is new. `HasEventBindings`, `HasTaskHandlers` and
`HasControllers` are new as PHPNomad shapes. `HasListeners` and
`HasEventBindings` are the event package's own types, re-exported, and
`CanSetContainer` is the container package's, re-exported.
`BaseInitializer.setContainer` returns `this`, as that interface asks.

### Errors

- A `DiException` from any step, `load()` included, stops the load and
  rejects with a `LoaderException`, as in PHPNomad. Its message is
  PHPNomad's, `Failed to load <name>`, and its cause is that same
  error. It also carries the initializer's name, its constructor name
  or `anonymous initializer` for a plain object, and its position in
  the list, counting from 1.
- A wrong shape rejects with a `TypeError`, not wrapped, as PHP's own
  `TypeError` for a wrong return type is not. Its message names the
  method, the initializer and its position. Examples are
  `shouldLoad()` answering anything but a boolean, a list method
  answering anything but an array, a pair of the wrong length, and an
  entry that is not a class where a class belongs.
- Every other error passes through unchanged and stops the load. This
  covers an initializer's own methods and the strategies.
- An error raised later, when a handler, task handler or controller is
  resolved on use, reaches whoever triggered the use: the broadcast,
  the task strategy, or the REST strategy. Retries, redelivery and
  dead-lettering belong to the task strategy, so a task handler must be
  safe to run more than once.

The bootstrapper logs nothing. The rejection is the failure signal, and
the caller that runs `load()` logs it with the name and position the
error carries.

### Ports for slice 8

The ports file (`src/ports.ts`) declares the two calls the loader makes
on strategies that have no TS Nomad package yet,
`LoaderTaskStrategy.attach(taskClass, handler)` and
`LoaderRestStrategy.registerRoute(getController)`, plus the task and
controller class shapes and the two string tokens. Slice 8 writes
`@tsnomad/tasks` and `@tsnomad/rest`. Their strategies must stay
assignable to these ports, which the compile-only test pins, and slice
8 swaps the string tokens for the packages' typed tokens of the same
names.

### 0.1 entry points that stay

- The constructor takes one array, `new Bootstrapper(container, [a,
  b])`, as well as separate arguments.
- `bootstrap(options)` runs `load()` and reads the event strategy by
  `options.eventStrategyToken` when given. The package deprecates it, as it does
  `EVENT_STRATEGY_TOKEN` and `BootstrapOptions`.
- The record form of class definitions, and plain functions as
  listeners.

The five current consumers use each of these, so they stay until the
consumers move.

## What breaks for 0.1 consumers

Packet P3, the consumer check, measures each of these against the five
consumers, and its fix patches carry only these changes.

- A later initializer's bindings are not there during an earlier
  initializer's `load()`. In 0.1 every initializer bound before any
  loaded. A handler class resolved on broadcast still sees every
  binding, since that runs after the whole load.
- An initializer with `getListeners`, `getTaskHandlers` or
  `getControllers` needs that strategy bound, even when its list is
  empty. The load fails with a `LoaderException` whose cause is the
  container's `BindingNotFoundError`. 0.1 skipped listeners with no
  event strategy without an error.
- `implements CanSetContainer` on a class whose `setContainer` returns
  void no longer compiles, because the interface is now the container
  package's, which returns `this`. A class that does not name the
  interface is still accepted, since `Initializer` takes any return.
- The name `HasEventBindings` now means the event package's pair
  shape. A class typed against the 0.1 loader interface keeps
  compiling only if its entries are `{ eventId, listener }` objects,
  which the new type also accepts.
- A wrong shape is a `TypeError`. 0.1 used what it could.

## Where this differs from PHPNomad

TypeScript or a missing package forces these:

- `load()` is async and awaits each step, `shouldLoad()` and the
  initializer's own `load()` included. JavaScript factories and
  listeners may be async, so the steps must wait.
- PHP's return types reject a wrong answer at run time. TypeScript's
  types are gone at run time, so the bootstrapper checks each answer
  itself and throws a `TypeError`, as PHP does.
- A class definition is a pair, because a TypeScript object key cannot
  be a class. A list of pairs cannot carry the container's
  concrete-to-abstract check pair by pair, so a concrete that does not
  fit its abstract compiles here.
- Five PHPNomad steps have no TS Nomad package yet, so the bootstrapper
  does not run them: `HasMutations` (after the class definitions),
  `HasUpdates` (after the task handlers), `HasTypeDefinitions` for
  GraphQL (before the controllers), and `HasCommands` and `HasFacades`
  (after the controllers, before `load()`). Each goes in that slot when
  its package exists.
  [TS Nomad Mirrors PHPNomad (KB 854)](https://navigator.novatori.us/r/kb/854)
  leaves open whether facades belong in TS Nomad at all.
- The task and REST strategies are read by string tokens until their
  packages exist.

TypeScript does not force the rest. They are open gaps under
[TS Nomad Alignment With PHPNomad (Charter 5012)](https://navigator.novatori.us/r/charter/5012).
The 0.1 forms stay because the five consumers use them, and dropping
them breaks those consumers, which Charter 5012 sends to Alex.

- A listener may be a plain function, the 0.1 form. PHPNomad's
  listeners are always handler classes.
- `getClassDefinitions()` may answer the 0.1 `{ token: factory }`
  record.
- `getEventBindings()` may hold 0.1 `{ eventId, listener }` entries,
  which go to the `EventStrategy` rather than the
  `ActionBindingStrategy`.
- The constructor also takes the initializers as one array, and the
  deprecated `bootstrap(options)` stays beside `load()`.
- `shouldLoad()` must answer a boolean. PHP without strict types turns
  a scalar answer into a boolean and throws only for null, arrays and
  objects, so this check is stricter.
- `LoaderException` takes the initializer's name, its position and the
  cause, and builds PHPNomad's message from them. PHP's takes a
  message, the code and the previous exception. The code is 500 in
  both.

## Dependencies

The loader depends on di-container and event at
`#feat/node-commerce-connectors`, the build's integration branch, so
its tests run against the slice 6 container and event code. Both refs
move to a release tag at the merge to main. An `overrides` entry in
`package.json` forces one copy of di-container, the one the loader
names, because the event package also depends on it, and two copies
would hold two separate sets of bindings and two `DiException` classes
that `instanceof` cannot match. The override goes when both packages
come from one release.

The package version stays 0.1.0 on this branch, and the version call
belongs to the merge to main.

## Files

| File | Role |
|---|---|
| `src/interfaces.ts` | `ClassDefinition`, `HasClassDefinitions`, `HasLoadCondition`, `Loadable`, the `Initializer` shape, the type guards, and the re-exports from the container and event packages |
| `src/ports.ts` | The task and REST shapes the loader calls, and their string tokens |
| `src/LoaderException.ts` | `LoaderException`, final |
| `src/Bootstrapper.ts` | `Bootstrapper`, with `load()` and `bootstrap()` as stubs for P1 |
| `src/BaseInitializer.ts` | `BaseInitializer`, final |

## Acceptance tests

| File | Tests | What it proves |
|---|---|---|
| `test/load-order.test.ts` | 7 | the exact step log for one initializer, one initializer finishing before the next, the container each receives, awaited steps |
| `test/load-condition.test.ts` | 7 | a false condition stops after `shouldLoad`, async conditions, a non-boolean answer |
| `test/class-definitions.test.ts` | 9 | pairs, abstract lists, typed tokens, the record form, duplicates, malformed answers |
| `test/event-bindings.test.ts` | 10 | string and object actions, transformers, 0.1 entries, strategy errors, malformed answers |
| `test/listeners.test.ts` | 17 | plain functions, handler classes and ES5 constructors resolved on broadcast, the strategy resolved before the record, a strategy failing mid-list, malformed answers |
| `test/task-handlers.test.ts` | 10 | handlers resolved when the task runs, failures reaching the strategy, the strategy resolved before the list, malformed answers |
| `test/controllers.test.ts` | 7 | lazy controllers, list order, the strategy resolved before the list, malformed answers |
| `test/errors.test.ts` | 11 | `LoaderException`, which errors wrap and which pass through, the stop at the first failure, no rollback, a second load |
| `test/bootstrapper-surface.test.ts` | 9 | the two constructor forms, `bootstrap()`, `getContainer`, `BaseInitializer`, the type guards |
| `test/legacy-initializers.test.ts` | 2 | 0.1 initializers loading unchanged |
| `test/package-exports.test.ts` | 1 | the public entry points, imported by package name |
| `test/loader-type-safety.ts` | 12 rejected calls | compile-only: each interface and port rejects the wrong shape |

That is 90 runtime tests. `npm test` reports 92, because it also counts
the fixtures file and the compile-only file as empty passes.
`npm run typecheck` checks the compile-only file.

Every test wires a real `Container` and, where events matter, the real
`InMemoryEventStrategy`. The action binding, task and REST strategies
are recording fakes, because TS Nomad has no Node implementation of
them yet. Slice 8 adds a test against the real task and REST strategies
when it writes them. The loader logs nothing, so the tests carry no
logger tripwire. Every failure surfaces as a rejection the tests check.

## Packets

- P1, the bootstrapper (`src/Bootstrapper.ts`, and the three stub
  guards in `src/interfaces.ts`). It owns `load()`, `bootstrap()`, the
  constructor's normalizing and the shape checks.
- P3, the consumer check across the five consumers, pinning
  di-container, event, loader and registry.

The registry repository's note covers P2.

## Proof

The proof folder (`ncc-slice-7-proof/`) holds the mutation lists and
their logs. Each list ran against a scratch implementation in a
separate clone that is never committed, with every `skip` removed.
Every guard has one mutation, and each run starts with three controls.
That folder's README gives the counts and says how to rerun the type
list here.
