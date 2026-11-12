/**
 * Acceptance tests, integration shape: `HasControllers`. Each controller
 * class goes to the strategy bound under 'RestStrategy' as a getter that
 * resolves the class from the real container when the strategy asks, as
 * PHPNomad's `registerRoute(fn() => $this->container->get($controller))`.
 * The REST strategy is a recording fake, because @tsnomad/rest does not
 * exist until slice 8.
 *
 * Packet P1 removes each `skip`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BindingNotFoundError } from '@tsnomad/di-container';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { LoaderException } from '../dist/LoaderException.js';
import { wire } from './fixtures.ts';

function controllers(answer: () => unknown): any {
  return { getControllers: answer };
}

test('each controller registers one route whose getter resolves the controller from the container', async () => {
  const { container, rest } = wire();
  class ConnectController {}
  class ReceiveController {}
  const double = { endpoint: '/siren/receive' };
  container.bindFactory(ReceiveController, () => double);

  await new Bootstrapper(container, [controllers(() => [ConnectController, ReceiveController])]).load();

  assert.equal(rest.getters.length, 2);
  assert.ok((await rest.getters[0]()) instanceof ConnectController);
  assert.equal(await rest.getters[1](), double);
});

test('a getter does not build its controller until the strategy calls it', async () => {
  const { container, rest } = wire();
  let built = 0;
  class Counted {
    constructor() {
      built += 1;
    }
  }

  await new Bootstrapper(container, [controllers(() => [Counted])]).load();
  assert.equal(built, 0);

  await rest.getters[0]();
  assert.equal(built, 1);
});

test('a controller may need a binding a later initializer makes', async () => {
  const { container, rest } = wire();
  class Receiver {}
  class ReceiveController {
    static readonly inject = ['Receiver'] as const;
    readonly receiver: Receiver;
    constructor(receiver: Receiver) {
      this.receiver = receiver;
    }
  }

  await new Bootstrapper(container, [
    controllers(() => [ReceiveController]),
    { getClassDefinitions: () => [[Receiver, 'Receiver']] } as any,
  ]).load();

  const controller = (await rest.getters[0]()) as ReceiveController;
  assert.ok(controller.receiver instanceof Receiver);
});

test('routes register in list order across initializers, with one strategy resolve', async () => {
  const { container, rest, log } = wire();
  class A {}
  class B {}
  class C {}

  await new Bootstrapper(container, [controllers(() => [A, B]), controllers(() => [C])]).load();

  assert.deepEqual(log, ['resolve:RestStrategy', 'registerRoute', 'registerRoute', 'registerRoute']);
  const built = await Promise.all(rest.getters.map((getter) => getter()));
  assert.ok(built[0] instanceof A);
  assert.ok(built[1] instanceof B);
  assert.ok(built[2] instanceof C);
});

test('controllers with no REST strategy bound fail the load with a LoaderException and the container error', async () => {
  const { container } = wire(['RestStrategy']);
  class Routes {
    getControllers() {
      return [class {}];
    }
  }

  await assert.rejects(new Bootstrapper(container, [new Routes()]).load(), (error: unknown) => {
    assert.ok(error instanceof LoaderException);
    assert.equal(error.initializer, 'Routes');
    assert.ok(error.cause instanceof BindingNotFoundError);
    return true;
  });
});

test('the REST strategy is resolved before the list is read, as PHPNomad does, so an empty list with none bound fails the load', async () => {
  const { container } = wire(['RestStrategy']);
  let asked = 0;
  await assert.rejects(new Bootstrapper(container, [controllers(() => {
    asked += 1;
    return [];
  })]).load(), (error: unknown) => error instanceof LoaderException && error.cause instanceof BindingNotFoundError);
  assert.equal(asked, 0);
});

test('a malformed answer fails the load with a TypeError and registers nothing from it', async () => {
  class Controller {}
  const malformed: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['a promise', Promise.resolve([Controller])],
    ['a class that is not in a list', Controller],
    ['a record', { receive: Controller }],
    ['a Set', new Set([Controller])],
    ['a list holding an instance', [Controller, new Controller()]],
    ['a list holding an arrow function', [Controller, () => new Controller()]],
    ['a list holding a string', [Controller, 'Controller']],
  ];
  for (const [label, answer] of malformed) {
    const { container, log } = wire();
    await assert.rejects(new Bootstrapper(container, [controllers(() => answer)]).load(), (error: unknown) => {
      assert.ok(error instanceof TypeError, `${label} gave ${String(error)}`);
      assert.match(error.message, /\(position 1\)/, label);
      assert.match(error.message, /getControllers/, label);
      return true;
    });
    assert.deepEqual(log.filter((line) => !line.startsWith('resolve:')), [], `${label} registered something`);
  }
});
