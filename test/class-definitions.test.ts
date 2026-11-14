/**
 * Acceptance tests, integration shape: `HasClassDefinitions` through a
 * real container. Pairs go to `bind(concrete, ...abstracts)`, the 0.1
 * record form goes to `bind(token, factory)`, and a malformed answer
 * binds nothing from that initializer.
 *
 * Step 3 checks every pair's abstracts before it binds any pair, so a
 * bad abstract fails with a `LoaderException` and binds nothing. Packet
 * P1 implemented these tests and packet P4 the abstract check, so every
 * test runs and passes.
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

test('a pair binds the concrete to its abstract', async () => {
  const container = new Container();
  await new Bootstrapper(container, [definitions(() => [[MemoryStore, Store]])]).load();

  assert.ok((await container.get(Store)) instanceof MemoryStore);
});

test('a pair with a list of abstracts binds them all to one shared instance', async () => {
  const container = new Container();
  await new Bootstrapper(container, [definitions(() => [[MemoryStore, [Store, Cache, 'store']]])]).load();

  const store = await container.get(Store);
  assert.ok(store instanceof MemoryStore);
  assert.equal(await container.get(Cache), store);
  assert.equal(await container.get('store'), store);
});

test('a pair binds to a typed token, and the concrete is autowired through its inject list', async () => {
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

test('the 0.1 record form binds each token to its factory, cached as 0.1 did', async () => {
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

test('every pair of every initializer is bound, in list order', async () => {
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

test('an empty list binds nothing and loads', async () => {
  const container = new Container();
  await new Bootstrapper(container, [definitions(() => [])]).load();
  assert.deepEqual(container.getTokens(), []);
});

test('a duplicate binding fails the load with a LoaderException naming the second initializer', async () => {
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

test('a pair with no abstract fails the load with a LoaderException whose cause names the step and the concrete, and binds nothing', async () => {
  const container = new Container();
  await assert.rejects(
    new Bootstrapper(container, [definitions(() => [[MemoryStore, []]])]).load(),
    (error: unknown) => {
      assert.ok(error instanceof LoaderException);
      assert.equal(error.position, 1);
      assert.ok(error.cause instanceof DiException);
      assert.match((error.cause as Error).message, /getClassDefinitions/);
      assert.match((error.cause as Error).message, /MemoryStore/);
      return true;
    }
  );
  assert.deepEqual(container.getTokens(), []);
});

test('a bad abstract on a later pair fails the load with a LoaderException and binds no pair from that answer', async () => {
  const cases: Array<{ label: string; earlier?: unknown; answer: unknown; duplicate?: string; bound: unknown[] }> = [
    { label: 'a later pair with no abstract', answer: [[MemoryStore, Store], [SystemClock, []]], bound: [] },
    { label: 'a later pair whose abstract is no token', answer: [[MemoryStore, Store], [SystemClock, [Clock, 42]]], bound: [] },
    { label: 'a later pair whose single abstract is null', answer: [[MemoryStore, Store], [SystemClock, null]], bound: [] },
    { label: 'a later pair naming an earlier pair\'s abstract', answer: [[MemoryStore, Store], [Cache, Store]], duplicate: 'Store', bound: [] },
    { label: 'a pair naming one abstract twice', answer: [[MemoryStore, Store], [SystemClock, [Clock, Clock]]], duplicate: 'Clock', bound: [] },
    {
      label: 'a later pair naming an abstract an earlier initializer bound',
      earlier: [[SystemClock, Clock]],
      answer: [[MemoryStore, Store], [Cache, Clock]],
      duplicate: 'Clock',
      bound: ['Clock'],
    },
    {
      label: 'a 0.1 record naming a token an earlier initializer bound',
      earlier: [[MemoryStore, 'Logger']],
      answer: { Value: () => 42, Logger: () => ({}) },
      duplicate: 'Logger',
      bound: ['Logger'],
    },
  ];

  for (const { label, earlier, answer, duplicate, bound } of cases) {
    const container = new Container();
    const initializers = earlier === undefined ? [definitions(() => answer)] : [definitions(() => earlier), definitions(() => answer)];
    await assert.rejects(new Bootstrapper(container, initializers).load(), (error: unknown) => {
      assert.ok(error instanceof LoaderException, `${label} gave ${String(error)}`);
      assert.equal(error.position, initializers.length, label);
      if (duplicate === undefined) {
        assert.ok(error.cause instanceof DiException, `${label} cause ${String(error.cause)}`);
        assert.match((error.cause as Error).message, /getClassDefinitions/, label);
        assert.match((error.cause as Error).message, /SystemClock/, label);
      } else {
        assert.ok(error.cause instanceof DuplicateBindingError, `${label} cause ${String(error.cause)}`);
        assert.equal(error.cause.token, duplicate, label);
      }
      return true;
    });
    assert.deepEqual(container.getTokens(), bound, `${label} bound ${String(container.getTokens())}`);
    assert.equal(container.has(Store), false, `${label} bound Store`);
    assert.equal(container.has('Value'), false, `${label} bound Value`);
  }
});

test('an answer that is neither a list of pairs nor a plain record fails the load with a TypeError and binds nothing', async () => {
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
        assert.ok(error instanceof TypeError, `${label} gave ${String(error)}`);
        assert.match(error.message, /\(position 1\)/, label);
        assert.match(error.message, /getClassDefinitions/, label);
        return true;
      }
    );
    assert.deepEqual(container.getTokens(), [], `${label} bound something`);
    assert.equal(container.has(Cache), false, `${label} bound Cache`);
  }
});
