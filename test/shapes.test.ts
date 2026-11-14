/**
 * Unit tests for the loader's internal shape checks, `src/shapes.ts`.
 * Written by packet P1. The acceptance tests reach these helpers only
 * through the bootstrapper, so these pin each one on its own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeValue,
  initializerName,
  isClassSyntax,
  isConstructable,
  isHandlerClass,
  isPlainObject,
} from '../dist/shapes.js';

class Plain {}
class Handles {
  handle(): void {}
}
function Es5Handles() {}
Es5Handles.prototype.handle = function () {};
function es5Plain() {}

test('isPlainObject accepts object literals and null-prototype objects, and nothing else', () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject({ a: 1 }), true);
  assert.equal(isPlainObject(Object.create(null)), true);

  for (const value of [null, undefined, 'x', 1, [], new Map(), Promise.resolve(), new Plain(), Plain, () => {}]) {
    assert.equal(isPlainObject(value), false, describeValue(value));
  }
});

test('isConstructable accepts classes and ES5 constructors, and refuses arrows, async functions and methods', () => {
  assert.equal(isConstructable(Plain), true);
  assert.equal(isConstructable(es5Plain), true);

  const method = { run() {} }.run;
  for (const value of [() => {}, async () => {}, async function named() {}, method, 'Plain', null, new Plain(), {}]) {
    assert.equal(isConstructable(value), false, describeValue(value));
  }
});

test('isHandlerClass needs a handle function on the prototype, written as a class or ES5', () => {
  assert.equal(isHandlerClass(Handles), true);
  assert.equal(isHandlerClass(Es5Handles), true);

  class FieldHandle {
    handle = (): void => {};
  }
  class StaticHandle {
    static handle(): void {}
  }
  for (const value of [Plain, FieldHandle, StaticHandle, es5Plain, new Handles(), { handle() {} }, () => {}]) {
    assert.equal(isHandlerClass(value), false, describeValue(value));
  }
});

test('isClassSyntax is true only for functions written with class', () => {
  assert.equal(isClassSyntax(Plain), true);
  assert.equal(isClassSyntax(class {}), true);

  for (const value of [es5Plain, Es5Handles, () => {}, 'class Plain {}', new Plain(), null]) {
    assert.equal(isClassSyntax(value), false, describeValue(value));
  }
});

test('initializerName is the constructor name, or anonymous initializer for a plain object or a nameless class', () => {
  assert.equal(initializerName(new Plain()), 'Plain');
  assert.equal(initializerName({}), 'anonymous initializer');
  assert.equal(initializerName(Object.create(null)), 'anonymous initializer');
  const Nameless = (() => class {})();
  Object.defineProperty(Nameless, 'name', { value: '' });
  assert.equal(initializerName(new Nameless()), 'anonymous initializer');
});

test('describeValue names each kind of value an initializer might answer', () => {
  assert.equal(describeValue(null), 'null');
  assert.equal(describeValue(undefined), 'undefined');
  assert.equal(describeValue([1, 2]), 'an array of length 2');
  assert.equal(describeValue('x'), 'the string "x"');
  assert.equal(describeValue(Plain), 'class Plain');
  assert.equal(describeValue(es5Plain), 'function es5Plain');
  assert.equal(describeValue({}), 'a plain object');
  assert.equal(describeValue(new Map()), 'a Map');
  assert.equal(describeValue(42), 'the number 42');
});
