/**
 * Acceptance tests, integration shape: which errors become a
 * LoaderException and which pass through, and that the load stops at the
 * first failing initializer. PHPNomad's loader wraps only a
 * `DiException`, with `'Failed to load ' . get_class($initializer)`.
 *
 * Packet P1 implemented these and removed their `skip`, so every test
 * here runs. The LoaderException class was final before P1, so its test
 * ran from the start.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutowireError, CircularDependencyError, Container, DiException, DuplicateBindingError } from '@tsnomad/di-container';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { LoaderException } from '../dist/LoaderException.js';
import type { ClassDefinition } from '../dist/interfaces.js';
import { SendSale, traced, UserCreated, wire } from './fixtures.ts';

test("LoaderException carries the initializer, its position and the cause, and its message is PHPNomad's", () => {
  const cause = new DiException("Token 'Mailer' is not bound. Available: none");
  const error = new LoaderException('ServiceInitializer', 2, cause);

  assert.ok(error instanceof Error);
  assert.equal(error.name, 'LoaderException');
  assert.equal(error.initializer, 'ServiceInitializer');
  assert.equal(error.position, 2);
  assert.equal(error.cause, cause);
  assert.equal(error.message, 'Failed to load ServiceInitializer');
  assert.equal(error.code, 500);
  assert.equal(new LoaderException('x', 1, 'plain').cause, 'plain');
});

test('a DiException thrown from load() becomes a LoaderException with it as the cause', async () => {
  class Warmup {
    container: Container | undefined = undefined;
    setContainer(container: Container): this {
      this.container = container;
      return this;
    }
    async load(): Promise<void> {
      await this.container?.get('NotBound');
    }
  }
  const container = new Container();

  await assert.rejects(new Bootstrapper(container, [new Warmup()]).load(), (error: unknown) => {
    assert.ok(error instanceof LoaderException);
    assert.equal(error.initializer, 'Warmup');
    assert.equal(error.position, 1);
    assert.ok(error.cause instanceof DiException);
    assert.equal(error.message, 'Failed to load Warmup');
    return true;
  });
});

test('every DiException subclass is wrapped, and the cause is the same object', async () => {
  const causes = [
    new DiException('plain'),
    new DuplicateBindingError('Store'),
    new AutowireError('Mailer', 'no-inject'),
    new CircularDependencyError(['Left', 'Right', 'Left']),
  ];
  for (const cause of causes) {
    const container = new Container();
    await assert.rejects(
      new Bootstrapper(container, [
        {
          load: () => {
            throw cause;
          },
        },
      ]).load(),
      (error: unknown) => error instanceof LoaderException && error.cause === cause
    );
  }
});

test('an error that is not a DiException passes through unchanged, from every method an initializer has', async () => {
  const methods = ['setContainer', 'shouldLoad', 'getClassDefinitions', 'getEventBindings', 'getListeners', 'getTaskHandlers', 'getControllers', 'load'];
  for (const method of methods) {
    const boom = new Error(`${method} broke`);
    const { container } = wire();
    const initializer: Record<string, unknown> = {
      [method]: () => {
        throw boom;
      },
    };
    await assert.rejects(new Bootstrapper(container, [initializer as any]).load(), (error) => error === boom, method);
  }
});

test('a rejected promise from load() that is not a DiException passes through unchanged', async () => {
  const boom = new RangeError('bad port');
  const container = new Container();
  await assert.rejects(
    new Bootstrapper(container, [{ load: async () => Promise.reject(boom) }]).load(),
    (error) => error === boom
  );
});

test('the load stops at the first failing initializer, and later initializers never start', async () => {
  const { container, log } = wire();
  const first = traced(log, 'First', { setContainer: true, load: () => {} });
  const failing = traced(log, 'Failing', {
    setContainer: true,
    load: () => {
      throw new DiException('missing');
    },
  });
  const after = traced(log, 'After', { setContainer: true, load: () => {} });

  await assert.rejects(new Bootstrapper(container, [first, failing, after]).load(), (error: unknown) => {
    assert.ok(error instanceof LoaderException);
    assert.equal(error.initializer, 'Failing');
    assert.equal(error.position, 2);
    return true;
  });
  assert.deepEqual(log, ['First.setContainer', 'First.load', 'Failing.setContainer', 'Failing.load']);
});

test('load() runs every step again when called again, so a second load into the same container fails at the first duplicate binding', async () => {
  class Store {}
  const log: string[] = [];
  const container = new Container();
  const bootstrapper = new Bootstrapper(container, [
    traced(log, 'Plain', { load: () => {} }),
    traced(log, 'Binds', { getClassDefinitions: () => [[Store, 'store']] }),
  ]);
  await bootstrapper.load();
  log.length = 0;

  await assert.rejects(bootstrapper.load(), (error: unknown) => {
    assert.ok(error instanceof LoaderException);
    assert.equal(error.initializer, 'Binds');
    assert.equal(error.position, 2);
    assert.ok(error.cause instanceof DuplicateBindingError);
    return true;
  });
  assert.deepEqual(log, ['Plain.load', 'Binds.getClassDefinitions']);
});

test('a failed load is not rolled back: what earlier initializers and earlier steps registered stays', async () => {
  class Store {}
  class Cache {}
  const container = new Container();
  const first = { getClassDefinitions: (): ClassDefinition[] => [[Store, 'store']] };
  const failing = {
    getClassDefinitions: (): ClassDefinition[] => [[Cache, 'cache']],
    load: () => {
      throw new DiException('missing');
    },
  };

  await assert.rejects(new Bootstrapper(container, [first, failing]).load(), (error: unknown) => error instanceof LoaderException);
  assert.equal(container.has('store'), true);
  assert.equal(container.has('cache'), true);
});

test('a plain object initializer is named anonymous initializer, with its position', async () => {
  const container = new Container();
  await assert.rejects(
    new Bootstrapper(container, [
      {},
      {
        load: () => {
          throw new DiException('missing');
        },
      },
    ]).load(),
    (error: unknown) => {
      assert.ok(error instanceof LoaderException);
      assert.equal(error.initializer, 'anonymous initializer');
      assert.equal(error.position, 2);
      return true;
    }
  );
});

test('a promise a strategy returns is awaited, so its rejection stops the load unchanged', async () => {
  class Handler {
    handle(): void {}
  }
  class Controller {}
  const cases: Array<[string, any, (wiring: ReturnType<typeof wire>, error: Error) => void]> = [
    ['bindAction', { getEventBindings: () => [[UserCreated, 'customer.created']] }, (w, error) => {
      w.actions.answer = Promise.reject(error);
    }],
    ['task attach', { getTaskHandlers: () => [[SendSale, Handler]] }, (w, error) => {
      w.tasks.answer = Promise.reject(error);
    }],
    ['registerRoute', { getControllers: () => [Controller] }, (w, error) => {
      w.rest.answer = Promise.reject(error);
    }],
  ];
  for (const [label, initializer, arrange] of cases) {
    const wiring = wire();
    const boom = new Error(`${label} failed`);
    arrange(wiring, boom);
    (wiring.actions.answer as Promise<void> | undefined)?.catch(() => {});
    (wiring.tasks.answer as Promise<void> | undefined)?.catch(() => {});
    (wiring.rest.answer as Promise<void> | undefined)?.catch(() => {});
    const after = traced(wiring.log, 'After', { setContainer: true });

    await assert.rejects(new Bootstrapper(wiring.container, [initializer, after]).load(), (error) => error === boom, label);
    assert.equal(wiring.log.includes('After.setContainer'), false, label);
  }
});

test('an async attach on the event strategy is awaited too', async () => {
  const { container, events, log } = wire();
  const boom = new Error('attach failed');
  events.attach = (() => Promise.reject(boom)) as any;
  const after = traced(log, 'After', { setContainer: true });

  await assert.rejects(
    new Bootstrapper(container, [{ getListeners: () => ({ 'user.created': () => {} }) } as any, after]).load(),
    (error) => error === boom
  );
  assert.equal(log.includes('After.setContainer'), false);
});
