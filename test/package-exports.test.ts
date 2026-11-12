/**
 * The package's public entry points, imported by name as a consumer
 * imports them, through the `exports` map in package.json.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as loader from '@tsnomad/loader';
import { Bootstrapper } from '@tsnomad/loader/bootstrapper';
import { LoaderException } from '@tsnomad/loader/loader-exception';
import { TASK_STRATEGY_TOKEN } from '@tsnomad/loader/ports';

test('the package root exports the loader, its errors, its guards and its tokens', () => {
  for (const name of ['Bootstrapper', 'BaseInitializer', 'LoaderException', 'CanSetContainer', 'EVENT_STRATEGY_TOKEN', 'TASK_STRATEGY_TOKEN', 'REST_STRATEGY_TOKEN', 'hasClassDefinitions', 'hasLoadCondition', 'hasListeners', 'hasEventBindings', 'hasTaskHandlers', 'hasControllers', 'isLoadable', 'canSetContainer']) {
    assert.ok(name in loader, `${name} is not exported`);
  }
  assert.equal(loader.Bootstrapper, Bootstrapper);
  assert.equal(loader.LoaderException, LoaderException);
  assert.equal(TASK_STRATEGY_TOKEN, 'TaskStrategy');
  assert.equal(loader.REST_STRATEGY_TOKEN, 'RestStrategy');
});
