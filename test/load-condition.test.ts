/**
 * Acceptance tests, integration shape: `HasLoadCondition`. The loader
 * hands the initializer its container first, as PHPNomad does, then
 * asks `shouldLoad()`, and a false answer skips every later step for
 * that initializer and nothing else.
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

/** An initializer with every step, each answering one entry, and the given condition. */
function conditional(log: string[], name: string, shouldLoad: () => unknown) {
  return traced(log, name, {
    setContainer: true,
    shouldLoad,
    getClassDefinitions: () => [[MemoryStore, Store]],
    getEventBindings: () => [[OrderPlaced, 'order.placed']],
    getListeners: () => ({ [UserCreated.getId()]: () => {} }),
    getTaskHandlers: () => [[SendSale, Handler]],
    getControllers: () => [Controller],
    load: () => {},
  });
}

test('a false condition skips every step after it, and the container was set before the question', async () => {
  const { container, log } = wire();

  await new Bootstrapper(container, [conditional(log, 'Off', () => false)]).load();

  assert.deepEqual(log, ['Off.setContainer', 'Off.shouldLoad']);
  assert.equal(container.has(Store), false);
});

test('a condition that resolves false skips every step after it', async () => {
  const { container, log } = wire();
  const off = conditional(log, 'Off', async () => {
    await tick();
    return false;
  });

  await new Bootstrapper(container, [off]).load();

  assert.deepEqual(log, ['Off.setContainer', 'Off.shouldLoad']);
});

test('a false condition skips only its own initializer, and the next one loads in full', async () => {
  const { container, log } = wire();
  const off = conditional(log, 'Off', () => false);
  const on = traced(log, 'On', {
    setContainer: true,
    getClassDefinitions: () => [[MemoryStore, Store]],
    load: () => {},
  });

  await new Bootstrapper(container, [off, on]).load();

  assert.deepEqual(log, [
    'Off.setContainer',
    'Off.shouldLoad',
    'On.setContainer',
    'On.getClassDefinitions',
    'bind',
    'On.load',
  ]);
  assert.equal(container.has(Store), true);
});

test('a true condition, sync or async, runs every step', async () => {
  for (const shouldLoad of [() => true, async () => true]) {
    const { container, log } = wire();
    await new Bootstrapper(container, [conditional(log, 'On', shouldLoad)]).load();
    assert.deepEqual(log, [
      'On.setContainer',
      'On.shouldLoad',
      'On.getClassDefinitions',
      'bind',
      'On.getEventBindings',
      'resolve:ActionBindingStrategy',
      'bindAction:order.placed:order.placed',
      'resolve:EventStrategy',
      'On.getListeners',
      'attach:user.created',
      'resolve:TaskStrategy',
      'On.getTaskHandlers',
      'taskAttach:send-sale',
      'resolve:RestStrategy',
      'On.getControllers',
      'registerRoute',
      'On.load',
    ]);
  }
});

test('the condition is asked after setContainer and before the class definitions', async () => {
  const { container, log } = wire();
  const seen: boolean[] = [];
  const initializer = traced(log, 'Asks', {
    setContainer: true,
    shouldLoad: () => {
      seen.push(initializer.received.length === 1, container.has(Store));
      return true;
    },
    getClassDefinitions: () => [[MemoryStore, Store]],
  });

  await new Bootstrapper(container, [initializer]).load();

  assert.deepEqual(seen, [true, false]);
});

test('an answer that is not a boolean fails the load with a TypeError naming the initializer, and runs no later step', async () => {
  for (const answer of [undefined, null, 1, 0, 'yes', '', {}, Promise.resolve(undefined), Promise.resolve('true')]) {
    const { container, log } = wire();
    const initializer = conditional(log, 'Vague', () => answer);
    const next = traced(log, 'Next', { setContainer: true });

    await assert.rejects(
      new Bootstrapper(container, [initializer, next]).load(),
      (error: unknown) => {
        assert.ok(error instanceof TypeError, `answer ${String(answer)} gave ${String(error)}`);
        assert.match(error.message, /shouldLoad/);
        assert.match(error.message, /Vague \(position 1\)/);
        return true;
      }
    );
    assert.deepEqual(log, ['Vague.setContainer', 'Vague.shouldLoad'], `answer ${String(answer)}`);
  }
});

test('a condition that throws stops the load with its own error, unchanged', async () => {
  const { container, log } = wire();
  const boom = new Error('settings unreadable');
  const initializer = conditional(log, 'Throws', () => {
    throw boom;
  });
  const next = traced(log, 'Next', { setContainer: true });

  await assert.rejects(new Bootstrapper(container, [initializer, next]).load(), (error) => error === boom);
  assert.deepEqual(log, ['Throws.setContainer', 'Throws.shouldLoad']);
});
