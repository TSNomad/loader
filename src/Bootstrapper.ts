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
 *    `handle(event)`. A plain function is attached as it is.
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
 * `load()` does not remember an earlier call. Calling it again runs
 * every step again, so a second load into the same container fails at
 * the first binding the container already holds.
 *
 * Errors:
 * - A `DiException` thrown by any step, including one thrown from
 *   `load()`, stops the load and rejects with a `LoaderException`
 *   naming the initializer, with the `DiException` as its cause, as in
 *   PHPNomad.
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
