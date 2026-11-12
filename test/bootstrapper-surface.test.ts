/**
 * Acceptance tests: the Bootstrapper's own surface. PHPNomad's
 * `new Bootstrapper($container, ...$initializers)` and `load()`, beside
 * the 0.1 array form and `bootstrap()`, and BaseInitializer.
 *
 * Packet P1 removes each `skip`. The tests of final code already run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '@tsnomad/di-container';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { BaseInitializer } from '../dist/BaseInitializer.js';
import {
  canSetContainer,
  hasClassDefinitions,
  hasControllers,
  hasEventBindings,
  hasListeners,
  hasLoadCondition,
  hasTaskHandlers,
  isLoadable,
} from '../dist/interfaces.js';
import { traced } from './fixtures.ts';

test('initializers given as separate arguments load in order, as in PHPNomad', async () => {
  const log: string[] = [];
  const container = new Container();
  await new Bootstrapper(container, traced(log, 'A', { load: () => {} }), traced(log, 'B', { load: () => {} })).load();
  assert.deepEqual(log, ['A.load', 'B.load']);
});

test('initializers given as one array, the 0.1 form, load in order', async () => {
  const log: string[] = [];
  const container = new Container();
  await new Bootstrapper(container, [traced(log, 'A', { load: () => {} }), traced(log, 'B', { load: () => {} })]).load();
  assert.deepEqual(log, ['A.load', 'B.load']);
});

test('bootstrap(), the 0.1 entry point, runs the same steps as load()', async () => {
  const log: string[] = [];
  const container = new Container();
  class Store {}
  await new Bootstrapper(container, [
    traced(log, 'A', { setContainer: true, getClassDefinitions: () => [[Store, 'Store']], load: () => {} }),
  ]).bootstrap();
  assert.deepEqual(log, ['A.setContainer', 'A.getClassDefinitions', 'A.load']);
  assert.equal(container.has('Store'), true);
});

test('a bootstrapper with no initializers loads', async () => {
  await new Bootstrapper(new Container()).load();
  await new Bootstrapper(new Container(), []).load();
});

test('a bootstrapper is Loadable, so it can be an initializer of another bootstrapper', async () => {
  const log: string[] = [];
  const container = new Container();
  const inner = new Bootstrapper(container, traced(log, 'Inner', { load: () => {} }));
  await new Bootstrapper(container, traced(log, 'Before', { load: () => {} }), inner, traced(log, 'After', { load: () => {} })).load();
  assert.deepEqual(log, ['Before.load', 'Inner.load', 'After.load']);
});

test('the same initializers can load into two containers', async () => {
  class Value {}
  const initializers = [{ getClassDefinitions: () => [[Value, 'Value']] } as any];
  const one = new Container();
  const two = new Container();
  await new Bootstrapper(one, initializers).load();
  await new Bootstrapper(two, initializers).load();
  assert.notEqual(await one.get('Value'), await two.get('Value'));
});

test('getContainer returns the container the bootstrapper was given', () => {
  const container = new Container();
  assert.equal(new Bootstrapper(container, []).getContainer(), container);
  assert.equal(new Bootstrapper(container).getContainer(), container);
});

test('BaseInitializer keeps the container and returns itself, as PHPNomad setContainer does', () => {
  class Core extends BaseInitializer {
    current(): Container {
      return this.container;
    }
  }
  const container = new Container();
  const core = new Core();
  assert.equal(core.setContainer(container), core);
  assert.equal(core.current(), container);
});

test('each type guard answers true when the method is there and false when it is not', () => {
  const guards: Array<[string, (init: any) => boolean]> = [
    ['getClassDefinitions', hasClassDefinitions],
    ['getListeners', hasListeners],
    ['getEventBindings', hasEventBindings],
    ['load', isLoadable],
    ['setContainer', canSetContainer],
    ['shouldLoad', hasLoadCondition],
    ['getTaskHandlers', hasTaskHandlers],
    ['getControllers', hasControllers],
  ];
  for (const [method, guard] of guards) {
    assert.equal(guard({ [method]: () => undefined }), true, method);
    assert.equal(guard({}), false, method);
    assert.equal(guard({ [method]: 'not a function' }), false, method);
  }
});
