/**
 * Acceptance tests, integration shape: the order PHPNomad's loader runs
 * an initializer's steps in, and that each initializer runs through
 * every step before the next one starts. Real container, real event
 * strategy, recording fakes for the strategies TS Nomad has no Node
 * implementation of yet.
 *
 * Packet P1 removes each `skip`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { OrderPlaced, SendSale, tick, traced, UserCreated, wire } from './fixtures.ts';

class Store {}
class MemoryStore extends Store {}
class Handler {
  handle(): void {}
}
class Controller {}

/** Every method, each answering one entry, so every step registers one thing. */
function everyStep(log: string[], name: string) {
  return traced(log, name, {
    setContainer: true,
    shouldLoad: () => true,
    getClassDefinitions: () => [[MemoryStore, Store]],
    getEventBindings: () => [[OrderPlaced, 'order.placed']],
    getListeners: () => ({ [UserCreated.getId()]: () => {} }),
    getTaskHandlers: () => [[SendSale, Handler]],
    getControllers: () => [Controller],
    load: () => {},
  });
}

test.skip('one initializer runs every step in PHPNomad order: container, condition, definitions, bindings, listeners, tasks, controllers, load', async () => {
  const { container, log } = wire();
  await new Bootstrapper(container, [everyStep(log, 'Core')]).load();

  assert.deepEqual(log, [
    'Core.setContainer',
    'Core.shouldLoad',
    'Core.getClassDefinitions',
    'bind',
    'Core.getEventBindings',
    'resolve:ActionBindingStrategy',
    'bindAction:order.placed:order.placed',
    'resolve:EventStrategy',
    'Core.getListeners',
    'attach:user.created',
    'resolve:TaskStrategy',
    'Core.getTaskHandlers',
    'taskAttach:send-sale',
    'resolve:RestStrategy',
    'Core.getControllers',
    'registerRoute',
    'Core.load',
  ]);
});

test.skip('each initializer finishes every step before the next initializer starts', async () => {
  const { container, log } = wire();
  const first = traced(log, 'First', {
    setContainer: true,
    getClassDefinitions: () => [[MemoryStore, Store]],
    getListeners: () => ({ [UserCreated.getId()]: () => {} }),
    load: () => {},
  });
  const second = traced(log, 'Second', {
    setContainer: true,
    getClassDefinitions: () => [[Handler, 'Handler']],
    load: () => {},
  });

  await new Bootstrapper(container, [first, second]).load();

  assert.deepEqual(log, [
    'First.setContainer',
    'First.getClassDefinitions',
    'bind',
    'resolve:EventStrategy',
    'First.getListeners',
    'attach:user.created',
    'First.load',
    'Second.setContainer',
    'Second.getClassDefinitions',
    'bind',
    'Second.load',
  ]);
});

test.skip('a later initializer is not bound yet while an earlier one loads', async () => {
  const { container, log } = wire();
  const seen: boolean[] = [];
  const first = traced(log, 'First', {
    load: () => {
      seen.push(container.has(Store));
    },
  });
  const second = traced(log, 'Second', {
    getClassDefinitions: () => [[MemoryStore, Store]],
  });

  await new Bootstrapper(container, [first, second]).load();

  assert.deepEqual(seen, [false]);
  assert.equal(container.has(Store), true);
});

test.skip('an initializer with only some methods runs only those steps, in the same order', async () => {
  const { container, log } = wire();
  const partial = traced(log, 'Partial', {
    load: () => {},
    getControllers: () => [Controller],
    setContainer: true,
  });

  await new Bootstrapper(container, [partial]).load();

  assert.deepEqual(log, [
    'Partial.setContainer',
    'resolve:RestStrategy',
    'Partial.getControllers',
    'registerRoute',
    'Partial.load',
  ]);
});

test.skip('an async load finishes before the next initializer starts', async () => {
  const { container, log } = wire();
  const first = traced(log, 'First', {
    load: async () => {
      await tick(20);
      log.push('First.load settled');
    },
  });
  const second = traced(log, 'Second', { setContainer: true });

  await new Bootstrapper(container, [first, second]).load();

  assert.deepEqual(log, ['First.load', 'First.load settled', 'Second.setContainer']);
});

test.skip('load resolves only after the last initializer has loaded', async () => {
  const { container, log } = wire();
  const last = traced(log, 'Last', {
    load: async () => {
      await tick(20);
      log.push('Last.load settled');
    },
  });

  await new Bootstrapper(container, [last]).load();
  log.push('load resolved');

  assert.deepEqual(log, ['Last.load', 'Last.load settled', 'load resolved']);
});

test.skip('each initializer receives the bootstrapper container itself', async () => {
  const { container, log } = wire();
  const first = traced(log, 'First', { setContainer: true });
  const second = traced(log, 'Second', { setContainer: true });

  await new Bootstrapper(container, [first, second]).load();

  assert.equal(first.received.length, 1);
  assert.equal(first.received[0], container);
  assert.equal(second.received[0], container);
});
