# @tsnomad/loader

A bootstrapper that runs a list of initializers against a container. Each
initializer can declare class bindings, event listeners, and a load hook, and
the bootstrapper wires them up in a fixed order: bindings first, then
listeners, then load hooks.

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
await new Bootstrapper(container, [new AppInitializer()]).bootstrap();
```

## Extracted 2026-09-17

This package was extracted on 2026-09-17 from a prototype carried inside
three Novatorius CLIs.

## License

MIT.
