/**
 * TSNomad Bootstrapper
 *
 * PHPNomad's `PHPNomad\Loader\Bootstrapper`. It loads a list of
 * initializers into a container, one initializer at a time, each
 * through every step before the next one starts.
 *
 * ```typescript
 * const container = new Container();
 * container.bind(InMemoryEventStrategy, EventStrategy, InMemoryEventStrategy);
 *
 * await new Bootstrapper(container, new CoreInitializer(), new PlatformInitializer()).load();
 * ```
 *
 * The steps, in PHPNomad's order, for each initializer:
 *
 * 1. `setContainer(container)`, when the initializer has it.
 * 2. `shouldLoad()`, when it has it, awaited. An answer of false skips
 *    every later step for this initializer, and the bootstrapper goes on
 *    to the next one. The skip is designed control flow, as in PHPNomad,
 *    so nothing is logged or thrown for it.
 * 3. `getClassDefinitions()`: each pair goes to
 *    `container.bind(concrete, ...abstracts)`, and each entry of the
 *    0.1 record form to `container.bind(token, factory)`.
 * 4. `getEventBindings()`: for each pair, the container's
 *    `ActionBindingStrategy` is resolved, and each action goes to it as
 *    `bindAction(eventClass, action)` or
 *    `bindAction(eventClass, action, transformer)`. A 0.1
 *    `{ eventId, listener }` entry is attached to the `EventStrategy`
 *    as a plain listener.
 * 5. `getListeners()`: the container's `EventStrategy` is resolved
 *    first, then each entry is attached to it under its event id. A
 *    handler class is attached through a listener that resolves the
 *    class from the container when the event fires and calls its
 *    `handle(event)`. A plain function is attached as it is. An entry
 *    is a handler class when its prototype has a `handle` function, or
 *    else when its source text starts with `class`. A class with no
 *    `handle` on its prototype is a wrong shape.
 * 6. `getTaskHandlers()`: the task strategy, at the token
 *    'TaskStrategy', is resolved first, then each handler class is
 *    attached to it through a function that resolves the class when the
 *    task runs and calls its `handle(task)`. That function rejects with
 *    whatever the resolve or `handle` threw, unchanged. Retries,
 *    redelivery and dead-lettering belong to the task strategy, so a
 *    handler must be safe to run more than once.
 * 7. `getControllers()`: the REST strategy, at the token
 *    'RestStrategy', is resolved first, then each controller class goes
 *    to it as `registerRoute(() => container.get(Controller))`.
 * 8. `load()`, awaited.
 *
 * A step whose method is missing is skipped. Steps 5 to 7 resolve their
 * strategy as soon as the initializer has the method, before they read
 * the list, as PHPNomad does, so an initializer with the method needs
 * the strategy bound even when its list is empty. Step 4 resolves the
 * strategy per entry, as PHPNomad does. The bootstrapper checks the
 * shape of a step's whole answer before it binds or attaches anything
 * from it, so a malformed answer registers nothing from that step.
 *
 * A failed load is not rolled back. What earlier initializers and
 * earlier entries registered stays registered, including the entries
 * attached before a strategy threw partway through a list.
 *
 * `load()` does not remember an earlier call. Calling it again runs
 * every step again, so a second load into the same container fails at
 * the first binding the container already holds.
 *
 * Errors:
 * - A `DiException` thrown by any step, including one thrown from
 *   `load()`, stops the load and rejects with a `LoaderException`
 *   naming the initializer, with the `DiException` as its cause and
 *   the code 500, as in PHPNomad.
 * - An answer of the wrong shape rejects with a `TypeError` whose
 *   message names the method, the initializer and its position. It is
 *   not wrapped, as PHP's own `TypeError` for a wrong return type is
 *   not. Examples: `shouldLoad()` answering something other than a
 *   boolean, a list method answering something other than an array, an
 *   entry that is not a class where a class belongs, a class with no
 *   `handle` method where a handler belongs.
 * - Every other error, from an initializer's own methods or from a
 *   strategy, passes through unchanged and stops the load.
 * - Errors raised later, when a handler, task handler or controller is
 *   resolved on use, reach whoever triggered that use: the broadcast,
 *   the task strategy or the REST strategy.
 *
 * The bootstrapper logs nothing. The rejection is the failure signal,
 * and the caller that runs `load()` logs it.
 *
 * Where this differs from PHPNomad:
 * - `load()` is async and awaits each step, including `shouldLoad()`
 *   and the initializer's own `load()`.
 * - PHP's return types reject a wrong answer at run time. TypeScript's
 *   types are gone at run time, so the bootstrapper checks each answer
 *   itself and throws the `TypeError` PHP would.
 * - Five PHPNomad steps have no TS Nomad package yet, so the
 *   bootstrapper does not run them: `HasMutations` (after the class
 *   definitions), `HasUpdates` (after the task handlers),
 *   `HasTypeDefinitions` for GraphQL (before the controllers), and
 *   `HasCommands` and `HasFacades` (after the controllers, before
 *   `load()`). Each goes in that slot when its package exists.
 *   Whether facades belong in TS Nomad at all is an open question in
 *   TS Nomad Mirrors PHPNomad (KB 854,
 *   https://navigator.novatori.us/r/kb/854).
 * - A listener may be a plain function, the 0.1 form, attached as it
 *   is. PHPNomad's listeners are always handler classes.
 * - The task and REST strategies are read by string tokens until
 *   @tsnomad/tasks and @tsnomad/rest exist.
 * - The constructor also takes the initializers as one array, the 0.1
 *   form.
 */

import { DiException } from '@tsnomad/di-container';
import type { Container, Token, TypedToken } from '@tsnomad/di-container';
import { ActionBindingStrategy, EventStrategy } from '@tsnomad/event';
import type { Initializer, Loadable } from './interfaces.js';
import {
  canSetContainer,
  hasClassDefinitions,
  hasControllers,
  hasEventBindings,
  hasListeners,
  hasLoadCondition,
  hasTaskHandlers,
  isLoadable,
} from './interfaces.js';
import { LoaderException } from './LoaderException.js';
import { REST_STRATEGY_TOKEN, TASK_STRATEGY_TOKEN } from './ports.js';
import type { LoaderRestStrategy, LoaderTaskStrategy } from './ports.js';
import { describeValue, initializerName, isClassSyntax, isConstructable, isHandlerClass, isPlainObject } from './shapes.js';

/**
 * The 0.1 name of the token the bootstrapper reads the event strategy
 * by. It is the name of the `EventStrategy` token from @tsnomad/event,
 * so either reaches the same binding.
 *
 * @deprecated Use the `EventStrategy` token from @tsnomad/event.
 */
export const EVENT_STRATEGY_TOKEN = 'EventStrategy';

/**
 * Options for the 0.1 `bootstrap()` call.
 *
 * @deprecated Call `load()`. Bind the event strategy under the
 * `EventStrategy` token.
 */
export interface BootstrapOptions {
  /**
   * The token to read the event strategy by, for steps 4 and 5.
   * Default: 'EventStrategy'
   */
  eventStrategyToken?: string;
}

/** The token a load reads the event strategy by. */
type EventStrategyKey = Token | TypedToken<EventStrategy>;

/** The part of the event strategy the loader calls. */
interface AttachesListeners {
  attach(eventId: string, listener: (event: any) => unknown): unknown;
}

/** The container's `bind`, in the two forms the loader calls. */
interface Binds {
  bind(...args: unknown[]): unknown;
}

/** One initializer's place in the load, for error messages. */
interface Place {
  readonly initializer: unknown;
  readonly position: number;
}

/** One validated entry of `getEventBindings()`. */
type EventBindingPlan =
  | { readonly kind: 'actions'; readonly eventClass: unknown; readonly actions: ReadonlyArray<{ action: string; transformer?: unknown }> }
  | { readonly kind: 'legacy'; readonly eventId: string; readonly listener: (event: any) => unknown };

export class Bootstrapper implements Loadable {
  private readonly container: Container;
  private readonly initializers: readonly unknown[];

  /**
   * @param container - The container to load into
   * @param initializers - The initializers, in load order, either as
   *   separate arguments, as in PHPNomad, or as one array, the 0.1 form
   */
  constructor(container: Container, initializers: readonly Initializer[]);
  constructor(container: Container, ...initializers: Initializer[]);
  constructor(container: Container, ...initializers: Initializer[] | [readonly Initializer[]]) {
    this.container = container;
    this.initializers =
      initializers.length === 1 && Array.isArray(initializers[0]) ? [...initializers[0]] : [...initializers];
  }

  /**
   * Loads every initializer, in order, each through every step before
   * the next one starts. See the class comment for the steps and the
   * errors.
   *
   * @throws LoaderException, through the returned promise, as the class
   *   comment describes
   */
  load(): Promise<void> {
    return this.run(EventStrategy);
  }

  /**
   * The 0.1 entry point. Runs `load()`, reading the event strategy by
   * `options.eventStrategyToken` when it is given.
   *
   * @deprecated Call `load()`.
   */
  bootstrap(options: BootstrapOptions = {}): Promise<void> {
    return this.run(options.eventStrategyToken ?? EVENT_STRATEGY_TOKEN);
  }

  /**
   * Gets the container.
   */
  getContainer(): Container {
    return this.container;
  }

  /**
   * Loads each initializer in turn, and turns a `DiException` from any
   * of its steps into a `LoaderException` naming it. Every other error
   * passes through unchanged. The first failure stops the load.
   */
  private async run(eventKey: EventStrategyKey): Promise<void> {
    for (const [index, initializer] of this.initializers.entries()) {
      const place: Place = { initializer, position: index + 1 };
      try {
        await this.loadInitializer(initializer as Initializer, place, eventKey);
      } catch (error) {
        if (error instanceof DiException) {
          throw new LoaderException(initializerName(initializer), place.position, error);
        }
        throw error;
      }
    }
  }

  /**
   * Runs one initializer through every step, in PHPNomad's order. A
   * false load condition ends it after step 2.
   */
  private async loadInitializer(init: Initializer, place: Place, eventKey: EventStrategyKey): Promise<void> {
    if (canSetContainer(init)) {
      init.setContainer(this.container);
    }
    if (hasLoadCondition(init) && !(await this.checkLoadCondition(init.shouldLoad(), place))) {
      return;
    }
    if (hasClassDefinitions(init)) {
      this.bindClassDefinitions(init.getClassDefinitions(), place);
    }
    if (hasEventBindings(init)) {
      await this.bindEvents(init.getEventBindings(), place, eventKey);
    }
    if (hasListeners(init)) {
      const events = await this.container.get<AttachesListeners>(eventKey as Token);
      await this.attachListeners(events, init.getListeners(), place);
    }
    if (hasTaskHandlers(init)) {
      const tasks = await this.container.get<LoaderTaskStrategy>(TASK_STRATEGY_TOKEN);
      await this.attachTaskHandlers(tasks, init.getTaskHandlers(), place);
    }
    if (hasControllers(init)) {
      const rest = await this.container.get<LoaderRestStrategy>(REST_STRATEGY_TOKEN);
      await this.registerControllers(rest, init.getControllers(), place);
    }
    if (isLoadable(init)) {
      await init.load();
    }
  }

  /**
   * Step 2. Awaits the answer and answers it, or throws a TypeError for
   * anything but a boolean.
   */
  private async checkLoadCondition(answer: unknown, place: Place): Promise<boolean> {
    const settled = await answer;
    if (typeof settled !== 'boolean') {
      throw this.shapeError('shouldLoad', `must answer a boolean, got ${describeValue(settled)}`, place);
    }
    return settled;
  }

  /**
   * Step 3. Checks the whole answer, then binds each pair, or each
   * entry of the 0.1 record, in order.
   */
  private bindClassDefinitions(answer: unknown, place: Place): void {
    const container = this.container as unknown as Binds;

    if (Array.isArray(answer)) {
      for (const [index, pair] of answer.entries()) {
        if (!Array.isArray(pair) || pair.length !== 2 || !isConstructable(pair[0])) {
          throw this.shapeError(
            'getClassDefinitions',
            `entry ${index} must be a [concrete class, abstracts] pair, got ${describeValue(pair)}`,
            place
          );
        }
      }
      for (const [concrete, abstracts] of answer as ReadonlyArray<readonly [unknown, unknown]>) {
        container.bind(concrete, ...(Array.isArray(abstracts) ? abstracts : [abstracts]));
      }
      return;
    }

    if (isPlainObject(answer)) {
      for (const [token, factory] of Object.entries(answer)) {
        if (typeof factory !== 'function') {
          throw this.shapeError(
            'getClassDefinitions',
            `record entry '${token}' must be a factory function, got ${describeValue(factory)}`,
            place
          );
        }
      }
      for (const [token, factory] of Object.entries(answer)) {
        container.bind(token, factory);
      }
      return;
    }

    throw this.shapeError(
      'getClassDefinitions',
      `must answer a list of [concrete, abstracts] pairs or a plain record, got ${describeValue(answer)}`,
      place
    );
  }

  /**
   * Step 4. Checks the whole answer, then, in list order, resolves the
   * action binding strategy for each pair and binds its actions, and
   * attaches each 0.1 entry to the event strategy.
   */
  private async bindEvents(answer: unknown, place: Place, eventKey: EventStrategyKey): Promise<void> {
    const plan = this.planEventBindings(answer, place);

    for (const entry of plan) {
      if (entry.kind === 'legacy') {
        const events = await this.container.get<AttachesListeners>(eventKey as Token);
        await events.attach(entry.eventId, entry.listener);
        continue;
      }
      const actions = await this.container.get(ActionBindingStrategy);
      const bindAction = actions.bindAction.bind(actions) as (...args: unknown[]) => unknown;
      for (const { action, transformer } of entry.actions) {
        if (transformer === undefined) {
          await bindAction(entry.eventClass, action);
        } else {
          await bindAction(entry.eventClass, action, transformer);
        }
      }
    }
  }

  /**
   * Checks every entry of `getEventBindings()` and answers what to bind,
   * or throws a TypeError for the first entry of the wrong shape.
   */
  private planEventBindings(answer: unknown, place: Place): EventBindingPlan[] {
    if (!Array.isArray(answer)) {
      throw this.shapeError('getEventBindings', `must answer a list, got ${describeValue(answer)}`, place);
    }

    return answer.map((entry: unknown, index): EventBindingPlan => {
      if (Array.isArray(entry)) {
        if (entry.length !== 2 || !isConstructable(entry[0])) {
          throw this.shapeError(
            'getEventBindings',
            `entry ${index} must be an [event class, actions] pair, got ${describeValue(entry)}`,
            place
          );
        }
        const listed: unknown[] = Array.isArray(entry[1]) ? entry[1] : [entry[1]];
        const actions = listed.map((action) => {
          if (typeof action === 'string') {
            return { action };
          }
          if (isPlainObject(action) && typeof action.action === 'string' && (action.transformer === undefined || typeof action.transformer === 'function')) {
            return { action: action.action, transformer: action.transformer };
          }
          throw this.shapeError(
            'getEventBindings',
            `entry ${index} has an action that is neither a name nor an { action, transformer } object: ${describeValue(action)}`,
            place
          );
        });
        return { kind: 'actions', eventClass: entry[0], actions };
      }

      if (entry !== null && typeof entry === 'object') {
        const legacy = entry as { eventId?: unknown; listener?: unknown };
        if (typeof legacy.eventId === 'string' && typeof legacy.listener === 'function') {
          return { kind: 'legacy', eventId: legacy.eventId, listener: legacy.listener as (event: any) => unknown };
        }
      }

      throw this.shapeError(
        'getEventBindings',
        `entry ${index} must be an [event class, actions] pair or an { eventId, listener } object, got ${describeValue(entry)}`,
        place
      );
    });
  }

  /**
   * Step 5, after the event strategy is resolved. Checks the whole
   * record, then attaches each entry under its event id, in order.
   */
  private async attachListeners(events: AttachesListeners, answer: unknown, place: Place): Promise<void> {
    if (!isPlainObject(answer)) {
      throw this.shapeError('getListeners', `must answer a plain object keyed by event id, got ${describeValue(answer)}`, place);
    }

    const plan: Array<[string, (event: any) => unknown]> = [];
    for (const [eventId, entries] of Object.entries(answer)) {
      for (const entry of Array.isArray(entries) ? entries : [entries]) {
        plan.push([eventId, this.listenerFor(entry, eventId, place)]);
      }
    }

    for (const [eventId, listener] of plan) {
      await events.attach(eventId, listener);
    }
  }

  /**
   * Sorts one listener entry by the contract's two checks. A handler
   * class becomes a listener that resolves it when the event fires. A
   * plain function is the listener itself. A class with no `handle`
   * method, and anything that is not a function, is a TypeError.
   */
  private listenerFor(entry: unknown, eventId: string, place: Place): (event: any) => unknown {
    if (isHandlerClass(entry)) {
      return async (event: unknown) => {
        const handler = await this.container.get(entry);
        await handler.handle(event);
      };
    }
    if (typeof entry !== 'function') {
      throw this.shapeError(
        'getListeners',
        `entry for '${eventId}' must be a handler class or a function, got ${describeValue(entry)}`,
        place
      );
    }
    if (isClassSyntax(entry)) {
      throw this.shapeError(
        'getListeners',
        `entry for '${eventId}' is a class with no handle method on its prototype: ${describeValue(entry)}`,
        place
      );
    }
    return entry as (event: any) => unknown;
  }

  /**
   * Step 6, after the task strategy is resolved. Checks the whole list,
   * then attaches each handler class, in order, through a function that
   * resolves it when the task runs.
   */
  private async attachTaskHandlers(tasks: LoaderTaskStrategy, answer: unknown, place: Place): Promise<void> {
    if (!Array.isArray(answer)) {
      throw this.shapeError('getTaskHandlers', `must answer a list, got ${describeValue(answer)}`, place);
    }

    const plan: Array<[unknown, abstract new (...args: any[]) => { handle(task: unknown): unknown }]> = [];
    for (const [index, pair] of answer.entries()) {
      if (!Array.isArray(pair) || pair.length !== 2 || !isConstructable(pair[0])) {
        throw this.shapeError(
          'getTaskHandlers',
          `entry ${index} must be a [task class, handlers] pair, got ${describeValue(pair)}`,
          place
        );
      }
      for (const handler of Array.isArray(pair[1]) ? pair[1] : [pair[1]]) {
        if (!isHandlerClass(handler)) {
          throw this.shapeError(
            'getTaskHandlers',
            `entry ${index} has a handler that is not a class with a handle method on its prototype: ${describeValue(handler)}`,
            place
          );
        }
        plan.push([pair[0], handler]);
      }
    }

    for (const [taskClass, handlerClass] of plan) {
      await tasks.attach(taskClass as Parameters<LoaderTaskStrategy['attach']>[0], async (task: unknown) => {
        const handler = await this.container.get(handlerClass);
        await handler.handle(task);
      });
    }
  }

  /**
   * Step 7, after the REST strategy is resolved. Checks the whole list,
   * then registers a route getter for each controller class, in order.
   */
  private async registerControllers(rest: LoaderRestStrategy, answer: unknown, place: Place): Promise<void> {
    if (!Array.isArray(answer)) {
      throw this.shapeError('getControllers', `must answer a list, got ${describeValue(answer)}`, place);
    }
    for (const [index, controller] of answer.entries()) {
      if (!isConstructable(controller)) {
        throw this.shapeError('getControllers', `entry ${index} must be a controller class, got ${describeValue(controller)}`, place);
      }
    }

    for (const controller of answer as ReadonlyArray<abstract new (...args: any[]) => object>) {
      await rest.registerRoute(() => this.container.get(controller));
    }
  }

  /**
   * The TypeError for an answer of the wrong shape. Its message names
   * the method, the initializer and its position.
   */
  private shapeError(method: string, problem: string, place: Place): TypeError {
    return new TypeError(
      `${method}() of ${initializerName(place.initializer)} (position ${place.position}) ${problem}`
    );
  }
}
