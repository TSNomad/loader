/**
 * Acceptance tests, integration shape: `HasEventBindings`. Each action
 * goes to the container's ActionBindingStrategy, as PHPNomad's loader
 * passes it, and the 0.1 `{ eventId, listener }` entry still loads as a
 * plain listener on the real event strategy.
 *
 * Packet P1 removes each `skip`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BindingNotFoundError } from '@tsnomad/di-container';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { LoaderException } from '../dist/LoaderException.js';
import { OrderPlaced, UserCreated, wire } from './fixtures.ts';

function bindings(answer: () => unknown): any {
  return { getEventBindings: answer };
}

const toOrder = (id: string) => new OrderPlaced(id);
const toUser = (id: string) => new UserCreated(id);

test('a bare action string binds the event class to the action with no transformer', async () => {
  const { container, actions } = wire();
  await new Bootstrapper(container, [bindings(() => [[OrderPlaced, 'order.placed']])]).load();

  assert.equal(actions.calls.length, 1);
  assert.equal(actions.calls[0].eventClass, OrderPlaced);
  assert.equal(actions.calls[0].action, 'order.placed');
  assert.equal(actions.calls[0].transformer, undefined);
});

test('an action object passes its own transformer', async () => {
  const { container, actions } = wire();
  await new Bootstrapper(container, [bindings(() => [[OrderPlaced, { action: 'order.completed', transformer: toOrder }]])]).load();

  assert.equal(actions.calls.length, 1);
  assert.equal(actions.calls[0].eventClass, OrderPlaced);
  assert.equal(actions.calls[0].action, 'order.completed');
  assert.equal(actions.calls[0].transformer, toOrder);
});

test('a list of actions binds each one, strings and objects, in order, across every pair', async () => {
  const { container, actions } = wire();
  await new Bootstrapper(container, [
    bindings(() => [
      [OrderPlaced, ['order.placed', { action: 'order.completed', transformer: toOrder }]],
      [UserCreated, { action: 'customer.created', transformer: toUser }],
    ]),
  ]).load();

  assert.deepEqual(
    actions.calls.map((call) => [call.eventClass, call.action, call.transformer]),
    [
      [OrderPlaced, 'order.placed', undefined],
      [OrderPlaced, 'order.completed', toOrder],
      [UserCreated, 'customer.created', toUser],
    ]
  );
});

test('the strategy is resolved once for an initializer with several bindings', async () => {
  const { container, log } = wire();
  await new Bootstrapper(container, [
    bindings(() => [
      [OrderPlaced, ['a', 'b']],
      [UserCreated, 'c'],
    ]),
  ]).load();

  assert.equal(log.filter((line) => line === 'resolve:ActionBindingStrategy').length, 1);
});

test('an empty list resolves no strategy, so it loads with none bound', async () => {
  const { container, log } = wire(['ActionBindingStrategy', 'EventStrategy']);
  await new Bootstrapper(container, [bindings(() => [])]).load();

  assert.deepEqual(log, []);
});

test('bindings with no ActionBindingStrategy bound fail the load with a LoaderException and the container error', async () => {
  const { container } = wire(['ActionBindingStrategy']);
  class StoreBindings {
    getEventBindings() {
      return [[OrderPlaced, 'order.placed']] as const;
    }
  }

  await assert.rejects(new Bootstrapper(container, [new StoreBindings()]).load(), (error: unknown) => {
    assert.ok(error instanceof LoaderException);
    assert.equal(error.initializer, 'StoreBindings');
    assert.ok(error.cause instanceof BindingNotFoundError);
    return true;
  });
});

test('a 0.1 { eventId, listener } entry loads as a plain listener on the event strategy, and needs no action strategy', async () => {
  const { container, events, log } = wire(['ActionBindingStrategy']);
  const heard: string[] = [];
  const listener = (event: UserCreated) => {
    heard.push(event.userId);
  };

  await new Bootstrapper(container, [bindings(() => [{ eventId: 'user.created', listener }])]).load();
  await events.broadcast(new UserCreated('u1'));

  assert.deepEqual(heard, ['u1']);
  assert.equal(events.attached[0].action, listener);
  assert.deepEqual(log, ['resolve:EventStrategy', 'attach:user.created']);
});

test('pairs and 0.1 entries in one list each reach their own strategy, in list order', async () => {
  const { container, log } = wire();
  await new Bootstrapper(container, [
    bindings(() => [
      [OrderPlaced, 'order.placed'],
      { eventId: 'user.created', listener: () => {} },
      [UserCreated, 'customer.created'],
    ]),
  ]).load();

  assert.deepEqual(
    log.filter((line) => !line.startsWith('resolve:')),
    ['bindAction:order.placed:order.placed', 'attach:user.created', 'bindAction:user.created:customer.created']
  );
});

test('an error the strategy throws, such as its TypeError for a bad event class, passes through unchanged', async () => {
  const { container, actions } = wire();
  const refusal = new TypeError("bindAction refused 'order.placed'");
  actions.bindAction = () => {
    throw refusal;
  };

  await assert.rejects(
    new Bootstrapper(container, [bindings(() => [[OrderPlaced, 'order.placed']])]).load(),
    (error) => error === refusal
  );
});

test('a malformed answer fails the load with a TypeError and binds nothing from it', async () => {
  const malformed: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['a promise', Promise.resolve([[OrderPlaced, 'order.placed']])],
    ['a record', { 'order.placed': OrderPlaced }],
    ['a pair that is not in a list', [OrderPlaced, 'order.placed']],
    ['a Set', new Set([[OrderPlaced, 'order.placed']])],
    ['a pair with no actions', [[OrderPlaced, 'a'], [UserCreated]]],
    ['a pair with a third item', [[OrderPlaced, 'a'], [UserCreated, 'b', 'c']]],
    ['a pair whose event is not a class', [[OrderPlaced, 'a'], ['order.placed', 'b']]],
    ['an action that is a number', [[OrderPlaced, 'a'], [UserCreated, 7]]],
    ['an action object with no action name', [[OrderPlaced, 'a'], [UserCreated, { transformer: toUser }]]],
    ['an action object whose transformer is not a function', [[OrderPlaced, 'a'], [UserCreated, { action: 'b', transformer: 'toUser' }]]],
    ['a list of actions holding a number', [[OrderPlaced, ['a', 7]]]],
    ['a 0.1 entry with no listener', [[OrderPlaced, 'a'], { eventId: 'user.created' }]],
    ['a 0.1 entry whose event id is not a string', [[OrderPlaced, 'a'], { eventId: UserCreated, listener: () => {} }]],
  ];
  for (const [label, answer] of malformed) {
    const { container, log } = wire();
    await assert.rejects(new Bootstrapper(container, [bindings(() => answer)]).load(), (error: unknown) => {
      assert.ok(error instanceof TypeError, `${label} gave ${String(error)}`);
      assert.match(error.message, /\(position 1\)/, label);
      assert.match(error.message, /getEventBindings/, label);
      return true;
    });
    assert.deepEqual(log.filter((line) => !line.startsWith('resolve:')), [], `${label} registered something`);
  }
});
