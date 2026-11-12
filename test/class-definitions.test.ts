/**
 * Acceptance tests, integration shape: `HasClassDefinitions` through a
 * real container. Pairs go to `bind(concrete, ...abstracts)`, the 0.1
 * record form goes to `bind(token, factory)`, and a malformed answer
 * binds nothing from that initializer.
 *
 * Packet P1 removes each `skip`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, createToken, DuplicateBindingError, DiException } from '@tsnomad/di-container';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { LoaderException } from '../dist/LoaderException.js';

interface Clock {
  now(): number;
}
const Clock = createToken<Clock>('Clock');

class Store {}
class MemoryStore extends Store {}
class Cache {}
class SystemClock implements Clock {
  now(): number {
    return 1;
  }
}
class Mailer {
  static readonly inject = [Store] as const;
  readonly store: Store;
  constructor(store: Store) {
    this.store = store;
  }
}

function definitions(answer: () => unknown): any {
  return { getClassDefinitions: answer };
}

test.skip('a pair binds the concrete to its abstract', async () => {
  const container = new Container();
  await new Bootstrapper(container, [definitions(() => [[MemoryStore, Store]])]).load();

  assert.ok((await container.get(Store)) instanceof MemoryStore);
});

test.skip('a pair with a list of abstracts binds them all to one shared instance', async () => {
  const container = new Container();
  await new Bootstrapper(container, [definitions(() => [[MemoryStore, [Store, Cache, 'store']]])]).load();

  const store = await container.get(Store);
  assert.ok(store instanceof MemoryStore);
  assert.equal(await container.get(Cache), store);
  assert.equal(await container.get('store'), store);
});

test.skip('a pair binds to a typed token, and the concrete is autowired through its inject list', async () => {
  const container = new Container();
  await new Bootstrapper(container, [
    definitions(() => [
      [SystemClock, Clock],
      [MemoryStore, Store],
      [Mailer, 'Mailer'],
    ]),
  ]).load();

  assert.equal((await container.get(Clock)).now(), 1);
  const mailer = await container.get<Mailer>('Mailer');
  assert.ok(mailer.store instanceof MemoryStore);
});

test.skip('the 0.1 record form binds each token to its factory, cached as 0.1 did', async () => {
  const container = new Container();
  let runs = 0;
  await new Bootstrapper(container, [
    definitions(() => ({
      Logger: () => {
        runs += 1;
        return { runs };
      },
      Value: async () => 42,
    })),
  ]).load();

  const first = await container.get('Logger');
  assert.equal(await container.get('Logger'), first);
  assert.equal(runs, 1);
  assert.equal(await container.get('Value'), 42);
});

test.skip('every pair of every initializer is bound, in list order', async () => {
  const container = new Container();
  const order: unknown[] = [];
  const bind = container.bind.bind(container) as (...args: unknown[]) => unknown;
  (container as any).bind = (...args: unknown[]) => {
    order.push(args[0]);
    return bind(...args);
  };

  await new Bootstrapper(container, [
    definitions(() => [
      [MemoryStore, Store],
      [SystemClock, Clock],
    ]),
    definitions(() => [[Mailer, 'Mailer']]),
  ]).load();

  assert.deepEqual(order, [MemoryStore, SystemClock, Mailer]);
});

test.skip('an empty list binds nothing and loads', async () => {
  const container = new Container();
  await new Bootstrapper(container, [definitions(() => [])]).load();
  assert.deepEqual(container.getTokens(), []);
});

test.skip('a duplicate binding fails the load with a LoaderException naming the second initializer', async () => {
  class CoreInitializer {
    getClassDefinitions() {
      return [[MemoryStore, Store]] as const;
    }
  }
  class PlatformInitializer {
    getClassDefinitions() {
      return [[MemoryStore, Store]] as const;
    }
  }
  const container = new Container();

  await assert.rejects(
    new Bootstrapper(container, [new CoreInitializer(), new PlatformInitializer()]).load(),
    (error: unknown) => {
      assert.ok(error instanceof LoaderException);
      assert.equal(error.initializer, 'PlatformInitializer');
      assert.equal(error.position, 2);
      assert.ok(error.cause instanceof DuplicateBindingError);
      return true;
    }
  );
});

test.skip('a pair with no abstract fails the load with the container error as the cause', async () => {
  const container = new Container();
  await assert.rejects(
    new Bootstrapper(container, [definitions(() => [[MemoryStore, []]])]).load(),
    (error: unknown) => error instanceof LoaderException && error.cause instanceof DiException
  );
});

test.skip('an answer that is neither a list of pairs nor a plain record fails the load and binds nothing', async () => {
  const malformed: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['a promise', Promise.resolve([[MemoryStore, Store]])],
    ['a class', MemoryStore],
    ['a Map', new Map([['Store', () => new MemoryStore()]])],
    ['a pair that is not in a list', [MemoryStore, Store]],
    ['a list with a class where a pair belongs', [[Cache, Cache], MemoryStore]],
    ['a pair with three elements', [[MemoryStore, Store, Cache]]],
    ['a pair whose concrete is not a class', [['MemoryStore', Store]]],
    ['a record whose factory is not a function', { Logger: () => ({}), Value: 42 }],
  ];
  for (const [label, answer] of malformed) {
    const container = new Container();
    await assert.rejects(
      new Bootstrapper(container, [definitions(() => answer)]).load(),
      (error: unknown) => {
        assert.ok(error instanceof LoaderException, `${label} gave ${String(error)}`);
        assert.ok(error.cause instanceof TypeError, label);
        assert.match(error.message, /getClassDefinitions/, label);
        return true;
      }
    );
    assert.deepEqual(container.getTokens(), [], `${label} bound something`);
    assert.equal(container.has(Cache), false, `${label} bound Cache`);
  }
});
