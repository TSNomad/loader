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
 * 2. `shouldLoad()`, when it has it. An answer of false skips every
 *    later step for this initializer, and the bootstrapper goes on to
 *    the next one.
 * 3. `getClassDefinitions()`: each pair goes to
 *    `container.bind(concrete, ...abstracts)`, and each entry of the
 *    0.1 record form to `container.bind(token, factory)`.
 * 4. `getEventBindings()`: each action goes to the container's
 *    `ActionBindingStrategy`, as `bindAction(eventClass, action)` or
 *    `bindAction(eventClass, action, transformer)`. A 0.1
 *    `{ eventId, listener }` entry is attached to the `EventStrategy`
 *    as a plain listener.
 * 5. `getListeners()`: each entry is attached to the container's
 *    `EventStrategy` under its event id. A plain function is attached
 *    as it is. A handler class is attached through a listener that
 *    resolves the class from the container when the event fires and
 *    calls its `handle(event)`.
 * 6. `getTaskHandlers()`: each handler class is attached to the
 *    container's task strategy, resolved by the key 'TaskStrategy',
 *    through a function that resolves the class when the task runs and
 *    calls its `handle(task)`.
 * 7. `getControllers()`: each controller class goes to the container's
 *    REST strategy, resolved by the key 'RestStrategy', as
 *    `registerRoute(() => container.get(Controller))`.
 * 8. `load()`, awaited.
 *
 * A step whose method is missing is skipped. A step whose list is empty
 * resolves no strategy. Each strategy is resolved once per step, when
 * the step has at least one entry for it. The bootstrapper checks the
 * shape of a step's whole answer before it binds or attaches anything
 * from it, so a malformed answer registers nothing from that step.
 *
 * Errors:
 * - A `DiException` thrown by any step, including one thrown from
 *   `load()`, stops the load and rejects with a `LoaderException`
 *   naming the initializer, with the `DiException` as its cause.
 * - An answer of the wrong shape, such as `shouldLoad()` answering
 *   something other than a boolean, a list method answering something
 *   other than an array, or an entry that is not a class where a class
 *   belongs, rejects the same way, with a `TypeError` as the cause.
 * - Every other error, from an initializer's own methods or from a
 *   strategy, passes through unchanged and stops the load.
 * - Errors raised later, when a handler, task handler or controller is
 *   resolved on use, reach whoever triggered that use: the broadcast,
 *   the task strategy or the REST strategy.
 *
 * Where this differs from PHPNomad:
 * - `load()` is async and awaits each step, including `shouldLoad()`
 *   and the initializer's own `load()`.
 * - An empty list never resolves its strategy. PHPNomad resolves the
 *   event and REST strategies as soon as an initializer has the method.
 * - A malformed answer fails the load. PHP would fail on a type error
 *   or silently use what it can.
 * - The constructor also takes the initializers as one array, the 0.1
 *   form.
 */

import type { Container } from '@tsnomad/di-container';
import type { Initializer, Loadable } from './interfaces.js';

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
    this.initializers = initializers;
  }

  /**
   * Loads every initializer, in order, each through every step before
   * the next one starts. See the class comment for the steps and the
   * errors.
   *
   * Stub: packet P1 implements it.
   *
   * @throws LoaderException, through the returned promise, as the class
   *   comment describes
   */
  load(): Promise<void> {
    void this.initializers;
    return Promise.resolve();
  }

  /**
   * The 0.1 entry point. Runs `load()`, reading the event strategy by
   * `options.eventStrategyToken` when it is given.
   *
   * Stub: packet P1 implements it.
   *
   * @deprecated Call `load()`.
   */
  bootstrap(options: BootstrapOptions = {}): Promise<void> {
    void options;
    return Promise.resolve();
  }

  /**
   * Gets the container.
   */
  getContainer(): Container {
    return this.container;
  }
}
