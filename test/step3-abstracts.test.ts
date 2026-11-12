/**
 * Unit tests for packet P4's internals in step 3: the `abstractKey`
 * helper in `src/shapes.ts`, and what the abstract check leaves open to
 * the acceptance tests. Those tests check which error type a bad
 * abstract raises and which token it names. These pin the key the
 * check compares by, the reason a `DuplicateBindingError` carries, and
 * an arrow function refused as an abstract before the container sees it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, createToken, DiException, DuplicateBindingError } from '@tsnomad/di-container';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { LoaderException } from '../dist/LoaderException.js';
import { abstractKey } from '../dist/shapes.js';

class Store {}
class MemoryStore extends Store {}
class Cache {}
function Es5Store() {}

function definitions(answer: () => unknown): any {
  return { getClassDefinitions: answer };
}

async function causeOf(container: Container, initializers: unknown[]): Promise<unknown> {
  let cause: unknown;
  await assert.rejects(new Bootstrapper(container, initializers as any[]).load(), (error: unknown) => {
    assert.ok(error instanceof LoaderException, String(error));
    cause = error.cause;
    return true;
  });
  return cause;
}

test('abstractKey keys a class by itself and a typed or string token by its name', () => {
  assert.equal(abstractKey(Store), Store);
  assert.equal(abstractKey(Es5Store), Es5Store);
  assert.equal(abstractKey('store'), 'store');
  assert.equal(abstractKey(createToken<Store>('store')), 'store');
  assert.equal(abstractKey(''), '');
});

test('abstractKey answers undefined for anything that is no class, typed token or string token', () => {
  const method = { run() {} }.run;
  for (const value of [42, null, undefined, true, [], ['Store'], {}, { name: 42 }, () => {}, async function named() {}, method, Symbol('Store')]) {
    assert.equal(abstractKey(value), undefined, String(typeof value === 'symbol' ? 'a symbol' : value));
  }
});

test('an abstract named twice in one answer is refused as repeated, one the container holds as bound', async () => {
  const repeated = await causeOf(new Container(), [definitions(() => [[MemoryStore, Store], [Cache, Store]])]);
  assert.ok(repeated instanceof DuplicateBindingError);
  assert.equal(repeated.token, 'Store');
  assert.equal(repeated.reason, 'repeated');

  const bound = await causeOf(new Container(), [definitions(() => [[MemoryStore, Store]]), definitions(() => [[Cache, Store]])]);
  assert.ok(bound instanceof DuplicateBindingError);
  assert.equal(bound.token, 'Store');
  assert.equal(bound.reason, 'bound');

  const record = await causeOf(new Container(), [definitions(() => [[MemoryStore, 'Logger']]), definitions(() => ({ Logger: () => ({}) }))]);
  assert.ok(record instanceof DuplicateBindingError);
  assert.equal(record.token, 'Logger');
  assert.equal(record.reason, 'bound');
});

test('a typed token and a string token with the same name are one abstract to the check, and nothing is bound', async () => {
  const container = new Container();
  const cause = await causeOf(container, [definitions(() => [[MemoryStore, 'store'], [Cache, createToken<Cache>('store')]])]);
  assert.ok(cause instanceof DuplicateBindingError);
  assert.equal(cause.token, 'store');
  assert.equal(cause.reason, 'repeated');
  assert.deepEqual(container.getTokens(), []);
});

test('two classes that share a name are two abstracts to the check', async () => {
  const First = (() => class Shared {})();
  const Second = (() => class Shared {})();
  const container = new Container();
  await new Bootstrapper(container, [definitions(() => [[MemoryStore, First], [Cache, Second]])]).load();
  assert.equal(container.has(First), true);
  assert.equal(container.has(Second), true);
});

test('an arrow function as an abstract fails with a DiException naming the step and the concrete, and binds nothing', async () => {
  const container = new Container();
  const cause = await causeOf(container, [definitions(() => [[MemoryStore, Store], [Cache, () => Store]])]);
  assert.ok(cause instanceof DiException);
  assert.equal(cause instanceof DuplicateBindingError, false);
  assert.match((cause as Error).message, /getClassDefinitions\(\) entry 1 binds Cache to /);
  assert.deepEqual(container.getTokens(), []);
});
