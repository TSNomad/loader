/**
 * Acceptance tests, integration shape: `HasTaskHandlers`. Each handler
 * class is attached to the strategy bound under 'TaskStrategy' through a
 * function that resolves the class from the real container when the task
 * runs, as PHPNomad's
 * `fn(Task $task) => $this->container->get($handlerClass)->handle($task)`.
 * The task strategy is a recording fake, because @tsnomad/tasks does not
 * exist until slice 8.
 *
 * Packet P1 removes each `skip`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BindingNotFoundError, DiException } from '@tsnomad/di-container';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { LoaderException } from '../dist/LoaderException.js';
import { RefreshPlan, SendSale, tick, wire } from './fixtures.ts';

function handlers(answer: () => unknown): any {
  return { getTaskHandlers: answer };
}

test('a handler class is attached for its task class, and running the task calls its handle with the task', async () => {
  const { container, tasks } = wire();
  const handled: string[] = [];
  class SendSaleHandler {
    handle(task: SendSale): void {
      handled.push(task.saleId);
    }
  }

  await new Bootstrapper(container, [handlers(() => [[SendSale, SendSaleHandler]])]).load();

  assert.equal(tasks.calls.length, 1);
  assert.equal(tasks.calls[0].taskClass, SendSale);
  await tasks.calls[0].handler(new SendSale('s1'));
  assert.deepEqual(handled, ['s1']);
});

test('the handler is resolved through the container when the task runs, not during load', async () => {
  const { container, tasks } = wire();
  const handled: unknown[] = [];
  let built = 0;
  class SendSaleHandler {
    constructor() {
      built += 1;
    }
    handle(task: SendSale): void {
      handled.push(task.saleId);
    }
  }
  container.bindFactory(SendSaleHandler, () => {
    built += 1;
    return {
      handle(task: SendSale) {
        handled.push(['double', task.saleId]);
      },
    };
  });

  await new Bootstrapper(container, [handlers(() => [[SendSale, SendSaleHandler]])]).load();
  assert.equal(built, 0);

  await tasks.run(new SendSale('s1'));
  assert.deepEqual(handled, [['double', 's1']]);
});

test('a handler may need a binding a later initializer makes', async () => {
  const { container, tasks } = wire();
  const sent: string[] = [];
  class Sender {
    send(id: string): void {
      sent.push(id);
    }
  }
  class SendSaleHandler {
    static readonly inject = ['Sender'] as const;
    readonly sender: Sender;
    constructor(sender: Sender) {
      this.sender = sender;
    }
    handle(task: SendSale): void {
      this.sender.send(task.saleId);
    }
  }

  await new Bootstrapper(container, [
    handlers(() => [[SendSale, SendSaleHandler]]),
    { getClassDefinitions: () => [[Sender, 'Sender']] } as any,
  ]).load();
  await tasks.run(new SendSale('s1'));

  assert.deepEqual(sent, ['s1']);
});

test('a list of handlers attaches each one, in order, across every pair, with one strategy resolve', async () => {
  const { container, tasks, log } = wire();
  const order: string[] = [];
  class Audit {
    handle(): void {
      order.push('audit');
    }
  }
  class Send {
    handle(): void {
      order.push('send');
    }
  }
  class Refresh {
    handle(): void {
      order.push('refresh');
    }
  }

  await new Bootstrapper(container, [handlers(() => [[SendSale, [Audit, Send]], [RefreshPlan, Refresh]])]).load();

  assert.deepEqual(log, ['resolve:TaskStrategy', 'taskAttach:send-sale', 'taskAttach:send-sale', 'taskAttach:refresh-plan']);
  await tasks.run(new SendSale('s1'));
  await tasks.run(new RefreshPlan());
  assert.deepEqual(order, ['audit', 'send', 'refresh']);
});

test("the function the strategy runs settles only after the handler's handle settles", async () => {
  const { container, tasks } = wire();
  const order: string[] = [];
  class Slow {
    async handle(): Promise<void> {
      await tick(20);
      order.push('handled');
    }
  }

  await new Bootstrapper(container, [handlers(() => [[SendSale, Slow]])]).load();
  await tasks.calls[0].handler(new SendSale('s1'));
  order.push('settled');

  assert.deepEqual(order, ['handled', 'settled']);
});

test('a failing handler rejects the function the strategy runs, so the strategy sees the failure', async () => {
  const { container, tasks } = wire();
  const boom = new Error('cloud unreachable');
  class Fails {
    handle(): void {
      throw boom;
    }
  }
  class AsyncFails {
    async handle(): Promise<void> {
      await tick();
      throw boom;
    }
  }

  await new Bootstrapper(container, [handlers(() => [[SendSale, [Fails, AsyncFails]]])]).load();

  await assert.rejects(tasks.calls[0].handler(new SendSale('s1')), (error) => error === boom);
  await assert.rejects(tasks.calls[1].handler(new SendSale('s1')), (error) => error === boom);
});

test('a handler that cannot be resolved rejects the function the strategy runs with the container error unchanged', async () => {
  const { container, tasks } = wire();
  class NeedsSender {
    handle(): void {}
  }
  const unbound = new DiException("Token 'Sender' is not bound");
  container.bindFactory(NeedsSender, () => {
    throw unbound;
  });

  await new Bootstrapper(container, [handlers(() => [[SendSale, NeedsSender]])]).load();

  await assert.rejects(tasks.calls[0].handler(new SendSale('s1')), (error) => error === unbound);
});

test('handlers with no task strategy bound fail the load with a LoaderException and the container error', async () => {
  const { container } = wire(['TaskStrategy']);
  class Jobs {
    getTaskHandlers() {
      return [[SendSale, class {
        handle(): void {}
      }]] as const;
    }
  }

  await assert.rejects(new Bootstrapper(container, [new Jobs()]).load(), (error: unknown) => {
    assert.ok(error instanceof LoaderException);
    assert.equal(error.initializer, 'Jobs');
    assert.ok(error.cause instanceof BindingNotFoundError);
    return true;
  });
});

test('the task strategy is resolved before the list is read, as PHPNomad does, so an empty list with none bound fails the load', async () => {
  const { container } = wire(['TaskStrategy']);
  let asked = 0;
  await assert.rejects(new Bootstrapper(container, [handlers(() => {
    asked += 1;
    return [];
  })]).load(), (error: unknown) => error instanceof LoaderException && error.cause instanceof BindingNotFoundError);
  assert.equal(asked, 0);
});

test('a malformed answer fails the load with a TypeError and attaches nothing from it', async () => {
  class Handler {
    handle(): void {}
  }
  const malformed: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['a promise', Promise.resolve([[SendSale, Handler]])],
    ['a record', { 'send-sale': Handler }],
    ['a pair that is not in a list', [SendSale, Handler]],
    ['a Set', new Set([[SendSale, Handler]])],
    ['a pair with no handler', [[SendSale, Handler], [RefreshPlan]]],
    ['a pair with a third item', [[SendSale, Handler], [RefreshPlan, Handler, Handler]]],
    ['a pair-shaped object that is not a list', [[SendSale, Handler], { 0: RefreshPlan, 1: Handler, length: 2 }]],
    ['a pair whose task is not a class', [[SendSale, Handler], ['refresh-plan', Handler]]],
    ['a handler that is an instance', [[SendSale, Handler], [RefreshPlan, new Handler()]]],
    ['a list of handlers holding a string', [[SendSale, [Handler, 'Handler']]]],
    ['a handler with no handle method', [[SendSale, Handler], [RefreshPlan, class NoHandle {}]]],
    ['a handler that is an arrow function', [[SendSale, Handler], [RefreshPlan, () => {}]]],
    ['a handler whose handle is an instance field, not a method', [[SendSale, Handler], [RefreshPlan, class FieldHandle {
      handle = (): void => {};
    }]]],
  ];
  for (const [label, answer] of malformed) {
    const { container, log } = wire();
    await assert.rejects(new Bootstrapper(container, [handlers(() => answer)]).load(), (error: unknown) => {
      assert.ok(error instanceof TypeError, `${label} gave ${String(error)}`);
      assert.match(error.message, /\(position 1\)/, label);
      assert.match(error.message, /getTaskHandlers/, label);
      return true;
    });
    assert.deepEqual(log.filter((line) => !line.startsWith('resolve:')), [], `${label} attached something`);
  }
});
