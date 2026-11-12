# @tsnomad/loader

A bootstrapper that runs a list of initializers against a container. Each
initializer can declare class bindings, event bindings, listeners, task
handlers, controllers and a load hook. The bootstrapper takes one
initializer at a time through every step, in PHPNomad's order, before it
starts the next.

This is the TypeScript counterpart to PHPNomad's
[loader](https://github.com/phpnomad/loader) package, the framework that
TSNomad follows in shape and naming.

## Install

```bash
npm install @tsnomad/loader
```

## Use

```ts
import { Container } from '@tsnomad/di-container';
import { Bootstrapper } from '@tsnomad/loader';

const container = new Container();
await new Bootstrapper(container, new CoreInitializer(), new AppInitializer()).load();
```

## Load order

`load()` runs PHPNomad's steps for each initializer, one initializer at
a time: `setContainer`, `shouldLoad`, class definitions, event
bindings, listeners, task handlers, controllers, then `load`. A false
`shouldLoad()` skips the rest of that initializer. The class comment on
`Bootstrapper` and the slice 7 architecture note
(`docs/architecture/ncc-slice-7.md`) give the details.

A failed load is not rolled back, and a second `load()` into the same
container fails at the first binding it already holds. To retry, build
a new container and load into it.

## Upgrading from 0.1

- Each initializer now runs every step before the next one starts, so
  a later initializer's bindings are not there during an earlier one's
  `load()`.
- An initializer with `getListeners`, `getTaskHandlers` or
  `getControllers` needs that strategy bound, even for an empty list.
  The load fails with a `LoaderException` when it is missing.
- An answer of the wrong shape fails the load with a `TypeError`.
- A bad abstract in `getClassDefinitions()` fails the load with a
  `LoaderException`. Once the pending step 3 change lands, it binds
  nothing from that answer.
- `CanSetContainer` is the container package's, and its `setContainer`
  returns `this`. A class that names the interface returns `this`.
- `HasEventBindings` is the event package's pair shape. The 0.1
  `{ eventId, listener }` entries still load.
- `bootstrap()` still works and is deprecated. Call `load()`.

## Where this differs from PHPNomad

- `load()` is async and awaits each step, `shouldLoad()` and the
  initializer's own `load()` included.
- The bootstrapper checks each answer's top-level type and throws the
  `TypeError` PHP's return types would, since TypeScript's types are
  gone at run time. It also checks every entry, and checks a whole
  answer before it registers anything from it. Those two go beyond PHP
  by choice.
- PHPNomad's mutations, updates, GraphQL, commands and facades steps
  have no TS Nomad package yet, so the bootstrapper skips them.
- PHPNomad's `CanLoadInitializers` and `CanConditionallyLoad` traits
  have no counterpart, since TypeScript has no traits. The steps live
  in `Bootstrapper`, and `HasLoadCondition` gives an initializer a load
  condition.
- A listener may be a plain function, the 0.1 form.
- The task and REST strategies are read by the string tokens
  `'TaskStrategy'` and `'RestStrategy'` until their packages exist.

The architecture note lists each difference in full.

## Extracted 2026-09-17

This package was extracted on 2026-09-17 from a prototype carried inside
three Novatorius CLIs.

## License

MIT.
