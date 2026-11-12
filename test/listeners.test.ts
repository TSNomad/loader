/**
 * Acceptance tests, integration shape: `HasListeners` through a real
 * container and the real InMemoryEventStrategy. A plain function is
 * attached as it is. A handler class is resolved from the container when
 * the event fires, as PHPNomad's
 * `fn(Event $event) => $this->container->get($handler)->handle($event)`.
 *
 * Packet P1 removes each `skip`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BindingNotFoundError, Container, DiException } from '@tsnomad/di-container';
import { EventStrategy, InMemoryEventStrategy } from '@tsnomad/event';
import type { CanHandle } from '@tsnomad/event';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { LoaderException } from '../dist/LoaderException.js';
import { OrderPlaced, tick, UserCreated, wire } from './fixtures.ts';

function listening(answer: () => unknown): any {
  return { getListeners: answer };
}

function busContainer(): { container: Container; events: InMemoryEventStrategy } {
  const container = new Container();
  const events = new InMemoryEventStrategy();
  container.bindFactory(EventStrategy, () => events);
  return { container, events };
}

test.skip('a plain function listener hears its event', async () => {
  const { container, events } = busContainer();
  const heard: string[] = [];

  await new Bootstrapper(container, [
    listening(() => ({
      [UserCreated.getId()]: (event: UserCreated) => {
        heard.push(event.userId);
      },
    })),
  ]).load();
  await events.broadcast(new UserCreated('u1'));

  assert.deepEqual(heard, ['u1']);
});

test.skip('a list of listeners runs in list order, for each event id', async () => {
  const { container, events } = busContainer();
  const heard: string[] = [];

  await new Bootstrapper(container, [
    listening(() => ({
      [UserCreated.getId()]: [() => {
        heard.push('first');
      }, () => {
        heard.push('second');
      }],
      [OrderPlaced.getId()]: () => {
        heard.push('order');
      },
    })),
  ]).load();
  await events.broadcast(new UserCreated('u1'));
  await events.broadcast(new OrderPlaced('o1'));

  assert.deepEqual(heard, ['first', 'second', 'order']);
});

test.skip('a handler class is resolved from the container and its handle receives the event', async () => {
  const { container, events } = busContainer();
  const handled: unknown[] = [];
  class Welcome implements CanHandle<UserCreated> {
    handle(event: UserCreated): void {
      handled.push(event);
    }
  }
  const double = {
    handle(event: UserCreated) {
      handled.push(['double', event.userId]);
    },
  };
  container.bindFactory(Welcome, () => double as Welcome);

  await new Bootstrapper(container, [listening(() => ({ [UserCreated.getId()]: Welcome }))]).load();
  await events.broadcast(new UserCreated('u1'));

  assert.deepEqual(handled, [['double', 'u1']]);
});

test.skip('a handler class is resolved when the event fires, so it may need a binding a later initializer makes', async () => {
  const { container, events } = busContainer();
  const sent: string[] = [];
  class Mailer {
    send(to: string): void {
      sent.push(to);
    }
  }
  class Welcome implements CanHandle<UserCreated> {
    static readonly inject = ['Mailer'] as const;
    readonly mailer: Mailer;
    constructor(mailer: Mailer) {
      this.mailer = mailer;
    }
    handle(event: UserCreated): void {
      this.mailer.send(event.userId);
    }
  }

  await new Bootstrapper(container, [
    listening(() => ({ [UserCreated.getId()]: Welcome })),
    { getClassDefinitions: () => [[Mailer, 'Mailer']] } as any,
  ]).load();
  await events.broadcast(new UserCreated('u1'));

  assert.deepEqual(sent, ['u1']);
});

test.skip('the handler is not built during load', async () => {
  const { container } = busContainer();
  let built = 0;
  class Counted implements CanHandle<UserCreated> {
    constructor() {
      built += 1;
    }
    handle(): void {}
  }

  await new Bootstrapper(container, [listening(() => ({ [UserCreated.getId()]: Counted }))]).load();

  assert.equal(built, 0);
});

test.skip("broadcast waits for an async handler's handle to settle", async () => {
  const { container, events } = busContainer();
  const order: string[] = [];
  class Slow implements CanHandle<UserCreated> {
    async handle(): Promise<void> {
      await tick(20);
      order.push('handled');
    }
  }

  await new Bootstrapper(container, [listening(() => ({ [UserCreated.getId()]: Slow }))]).load();
  await events.broadcast(new UserCreated('u1'));
  order.push('broadcast resolved');

  assert.deepEqual(order, ['handled', 'broadcast resolved']);
});

test.skip('a handler that cannot be resolved fails the broadcast, not the load', async () => {
  const { container, events } = busContainer();
  class NeedsMailer implements CanHandle<UserCreated> {
    static readonly inject = ['Mailer'] as const;
    constructor(mailer: unknown) {
      void mailer;
    }
    handle(): void {}
  }

  await new Bootstrapper(container, [listening(() => ({ [UserCreated.getId()]: NeedsMailer }))]).load();

  await assert.rejects(events.broadcast(new UserCreated('u1')), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 1);
    assert.ok(error.errors[0] instanceof DiException);
    return true;
  });
});

test.skip('an error from handle reaches the broadcast unchanged', async () => {
  const { container, events } = busContainer();
  const boom = new Error('mail down');
  class Fails implements CanHandle<UserCreated> {
    handle(): void {
      throw boom;
    }
  }

  await new Bootstrapper(container, [listening(() => ({ [UserCreated.getId()]: Fails }))]).load();

  await assert.rejects(events.broadcast(new UserCreated('u1')), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [boom]);
    return true;
  });
});

test.skip('a function with a prototype but no handle method is a plain listener, called with the event', async () => {
  const { container, events } = busContainer();
  const heard: unknown[] = [];
  function legacyListener(event: UserCreated) {
    heard.push(event.userId);
  }

  await new Bootstrapper(container, [listening(() => ({ [UserCreated.getId()]: legacyListener }))]).load();
  await events.broadcast(new UserCreated('u1'));

  assert.deepEqual(heard, ['u1']);
});

test.skip('a plain function is attached itself, by event id, at the default priority', async () => {
  const { container, events } = wire();
  const onUser = () => {};
  await new Bootstrapper(container, [listening(() => ({ [UserCreated.getId()]: onUser }))]).load();

  assert.equal(events.attached.length, 1);
  assert.equal(events.attached[0].event, 'user.created');
  assert.equal(events.attached[0].action, onUser);
  assert.ok(events.attached[0].priority === undefined || events.attached[0].priority === 10);
});

test.skip('the strategy bound under the 0.1 string token is the one the loader uses', async () => {
  const container = new Container();
  const events = new InMemoryEventStrategy();
  container.bind('EventStrategy', () => events);
  const heard: string[] = [];

  await new Bootstrapper(container, [listening(() => ({ 'user.created': () => {
    heard.push('heard');
  } }))]).load();
  await events.broadcast(new UserCreated('u1'));

  assert.deepEqual(heard, ['heard']);
});

test.skip('the 0.1 bootstrap option reads the event strategy by the token it names', async () => {
  const container = new Container();
  const events = new InMemoryEventStrategy();
  container.bind('Bus', () => events);
  const heard: string[] = [];

  await new Bootstrapper(container, [listening(() => ({ 'user.created': () => {
    heard.push('heard');
  } }))]).bootstrap({ eventStrategyToken: 'Bus' });
  await events.broadcast(new UserCreated('u1'));

  assert.deepEqual(heard, ['heard']);
  assert.equal(container.has('EventStrategy'), false);
});

test.skip('listeners with no event strategy bound fail the load with a LoaderException and the container error', async () => {
  const container = new Container();
  class Listens {
    getListeners() {
      return { 'user.created': () => {} };
    }
  }

  await assert.rejects(new Bootstrapper(container, [new Listens()]).load(), (error: unknown) => {
    assert.ok(error instanceof LoaderException);
    assert.equal(error.initializer, 'Listens');
    assert.ok(error.cause instanceof BindingNotFoundError);
    return true;
  });
});

test.skip('an empty record resolves no event strategy, so it loads with none bound', async () => {
  const container = new Container();
  await new Bootstrapper(container, [listening(() => ({}))]).load();
});

test.skip('a malformed answer fails the load with a LoaderException and attaches nothing from it', async () => {
  class Welcome implements CanHandle<UserCreated> {
    handle(): void {}
  }
  const malformed: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['a promise', Promise.resolve({ 'user.created': () => {} })],
    ['a list', [() => {}]],
    ['a Map', new Map([['user.created', () => {}]])],
    ['an entry that is an instance, not a class', { 'order.placed': () => {}, 'user.created': new Welcome() }],
    ['an entry that is a string', { 'order.placed': () => {}, 'user.created': 'Welcome' }],
    ['a list holding something other than a function', { 'order.placed': () => {}, 'user.created': [Welcome, null] }],
  ];
  for (const [label, answer] of malformed) {
    const { container, log } = wire();
    await assert.rejects(new Bootstrapper(container, [listening(() => answer)]).load(), (error: unknown) => {
      assert.ok(error instanceof LoaderException, `${label} gave ${String(error)}`);
      assert.ok(error.cause instanceof TypeError, label);
      assert.match(error.message, /getListeners/, label);
      return true;
    });
    assert.deepEqual(log.filter((line) => !line.startsWith('resolve:')), [], `${label} attached something`);
  }
});
