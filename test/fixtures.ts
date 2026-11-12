/**
 * Shared fixtures for the loader's acceptance tests. Plain fields, no
 * parameter properties, so node can run these files by stripping types.
 *
 * Every test wires a real Container from @tsnomad/di-container and, where
 * events matter, the real InMemoryEventStrategy from @tsnomad/event. Only
 * the strategies TS Nomad has no Node implementation of yet, action
 * binding, tasks and REST, are recording fakes.
 */

import { Container } from '@tsnomad/di-container';
import { ActionBindingStrategy, EventStrategy, InMemoryEventStrategy } from '@tsnomad/event';
import type { ActionTransformer, Event, EventClass, Listener } from '@tsnomad/event';

export type Log = string[];

export class UserCreated implements Event {
  static getId(): string {
    return 'user.created';
  }
  readonly userId: string;
  constructor(userId: string) {
    this.userId = userId;
  }
}

export class OrderPlaced implements Event {
  static getId(): string {
    return 'order.placed';
  }
  readonly orderId: string;
  constructor(orderId: string) {
    this.orderId = orderId;
  }
}

export class SendSale {
  static getId(): string {
    return 'send-sale';
  }
  readonly saleId: string;
  constructor(saleId: string) {
    this.saleId = saleId;
  }
}

export class RefreshPlan {
  static getId(): string {
    return 'refresh-plan';
  }
}

/** An InMemoryEventStrategy that logs each attach before it makes it. */
export class RecordingEventStrategy extends InMemoryEventStrategy {
  log: Log = [];
  attached: Array<{ event: unknown; action: unknown; priority: unknown }> = [];

  override attach(event: any, action: any, priority?: number): void {
    this.log.push(`attach:${typeof event === 'string' ? event : event.getId()}`);
    this.attached.push({ event, action, priority });
    super.attach(event, action, priority);
  }
}

/** A fake ActionBindingStrategy that records each call. */
export class RecordingActionBindingStrategy implements ActionBindingStrategy {
  log: Log = [];
  calls: Array<{ eventClass: unknown; action: string; transformer: unknown }> = [];
  answer: unknown = undefined;

  bindAction(eventClass: any, action: string, transformer?: any): any {
    this.log.push(`bindAction:${typeof eventClass === 'string' ? eventClass : eventClass.getId()}:${action}`);
    this.calls.push({ eventClass, action, transformer });
    return this.answer;
  }
}

/** A fake task strategy that records each attach and can run a task. */
export class RecordingTaskStrategy {
  log: Log = [];
  calls: Array<{ taskClass: { getId(): string }; handler: (task: any) => Promise<void> }> = [];
  answer: unknown = undefined;

  attach(taskClass: { getId(): string }, handler: (task: any) => Promise<void>): any {
    this.log.push(`taskAttach:${taskClass.getId()}`);
    this.calls.push({ taskClass, handler });
    return this.answer;
  }

  /** Runs every handler attached for the task's class, in attach order. */
  async run(task: object): Promise<void> {
    for (const call of this.calls) {
      if (task instanceof (call.taskClass as any)) {
        await call.handler(task);
      }
    }
  }
}

/** A fake REST strategy that records each route getter. */
export class RecordingRestStrategy {
  log: Log = [];
  getters: Array<() => Promise<object>> = [];
  answer: unknown = undefined;

  registerRoute(getController: () => Promise<object>): any {
    this.log.push('registerRoute');
    this.getters.push(getController);
    return this.answer;
  }
}

export interface Wiring {
  container: Container;
  events: RecordingEventStrategy;
  actions: RecordingActionBindingStrategy;
  tasks: RecordingTaskStrategy;
  rest: RecordingRestStrategy;
  /** One log for everything: initializer calls, binds, resolves and strategy calls. */
  log: Log;
}

/**
 * A real container with every strategy bound, each through a factory
 * that logs `resolve:<name>` when it first runs, and with `bind` traced
 * as `bind` in the same log. Pass a list of strategy names to leave out.
 */
export function wire(leaveOut: ReadonlyArray<'EventStrategy' | 'ActionBindingStrategy' | 'TaskStrategy' | 'RestStrategy'> = []): Wiring {
  const container = new Container();
  const log: Log = [];
  const events = new RecordingEventStrategy();
  const actions = new RecordingActionBindingStrategy();
  const tasks = new RecordingTaskStrategy();
  const rest = new RecordingRestStrategy();
  events.log = log;
  actions.log = log;
  tasks.log = log;
  rest.log = log;

  if (!leaveOut.includes('EventStrategy')) {
    container.bindFactory(EventStrategy, () => {
      log.push('resolve:EventStrategy');
      return events;
    });
  }
  if (!leaveOut.includes('ActionBindingStrategy')) {
    container.bindFactory(ActionBindingStrategy, () => {
      log.push('resolve:ActionBindingStrategy');
      return actions;
    });
  }
  if (!leaveOut.includes('TaskStrategy')) {
    container.bindFactory('TaskStrategy', () => {
      log.push('resolve:TaskStrategy');
      return tasks;
    });
  }
  if (!leaveOut.includes('RestStrategy')) {
    container.bindFactory('RestStrategy', () => {
      log.push('resolve:RestStrategy');
      return rest;
    });
  }

  const bind = container.bind.bind(container) as (...args: unknown[]) => unknown;
  (container as any).bind = (...args: unknown[]) => {
    log.push('bind');
    return bind(...args);
  };

  return { container, events, actions, tasks, rest, log };
}

/** What a traced initializer answers to each question. Leave a method out to leave it off the initializer. */
export interface Answers {
  setContainer?: true;
  shouldLoad?: () => unknown;
  getClassDefinitions?: () => unknown;
  getEventBindings?: () => unknown;
  getListeners?: () => unknown;
  getTaskHandlers?: () => unknown;
  getControllers?: () => unknown;
  load?: () => unknown;
}

/**
 * Builds an initializer whose class is named `name`, carrying only the
 * methods `answers` names. Each call logs `<name>.<method>` before it
 * answers. `setContainer` also keeps the container in `received`.
 */
export function traced(log: Log, name: string, answers: Answers): any {
  const Named = { [name]: class {} }[name] as new () => any;
  const initializer = new Named();
  initializer.received = [];
  for (const [method, answer] of Object.entries(answers)) {
    if (method === 'setContainer') {
      initializer.setContainer = function (container: unknown) {
        log.push(`${name}.setContainer`);
        initializer.received.push(container);
        return initializer;
      };
      continue;
    }
    initializer[method] = function () {
      log.push(`${name}.${method}`);
      return (answer as () => unknown)();
    };
  }
  return initializer;
}

/**
 * Makes a step async. No assertion depends on how long it waits: each
 * test that uses it checks the order of a log, which a loader that does
 * not await gets wrong at any speed.
 */
export const tick = (ms = 5): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type { ActionTransformer, EventClass, Listener };
