/**
 * TSNomad Bootstrap Interfaces
 *
 * The initializer interfaces PHPNomad's loader reads, and the type
 * guards the bootstrapper uses to tell which ones an initializer
 * implements. An initializer implements any subset of them.
 *
 * PHPNomad spreads these over several packages: `HasClassDefinitions`,
 * `HasLoadCondition` and `Loadable` live in phpnomad/loader,
 * `CanSetContainer` in phpnomad/di, `HasListeners` and
 * `HasEventBindings` in phpnomad/event, `HasTaskHandlers` in
 * phpnomad/tasks and `HasControllers` in phpnomad/rest. This file
 * re-exports the first two groups from their TS Nomad packages and
 * declares the task and controller shapes in `./ports.ts`, because
 * @tsnomad/tasks and @tsnomad/rest do not exist yet.
 */

import type { AnyAbstract, Constructor, Container, Factory, Token } from '@tsnomad/di-container';
import type { EventBinding, EventBindingDefinition, HasEventBindings, HasListeners } from '@tsnomad/event';
import type { ControllerClass, HasControllers, HasTaskHandlers, TaskHandlerDefinition } from './ports.js';

/**
 * One class definition: a concrete class and the abstract, or the
 * abstracts, it is bound to. The loader passes each pair to
 * `container.bind(concrete, ...abstracts)`, so every abstract in one
 * pair shares one instance.
 *
 * Where this differs from PHPNomad: PHP returns
 * `[Concrete::class => Abstract::class]`, keyed by the concrete. A
 * TypeScript object key cannot be a class, so a definition is a pair.
 * The container's `bind` checks a concrete against its abstracts at
 * compile time, and a list of pairs cannot carry that check pair by
 * pair, so a concrete that does not fit its abstract compiles here.
 */
export type ClassDefinition = readonly [
  concrete: Constructor<object>,
  abstracts: AnyAbstract | readonly AnyAbstract[],
];

/**
 * The 0.1 form of class definitions: a record from a token to a
 * factory, bound with the container's 0.1 `bind(token, factory)`, which
 * caches the factory's result.
 *
 * @deprecated Return `ClassDefinition` pairs, and bind factories in
 * `load()` with `bindFactory` where a class cannot be autowired.
 */
export type LegacyClassDefinitions = Record<Token, Factory<unknown>>;

/**
 * PHPNomad's `PHPNomad\Loader\Interfaces\HasClassDefinitions`.
 *
 * @example
 * ```typescript
 * class ConnectInitializer implements HasClassDefinitions {
 *   getClassDefinitions() {
 *     return [
 *       [MemoryConnectionStore, ConnectionStore],
 *       [ConsoleLogger, [LoggerStrategy, ConsoleLogger]],
 *     ] as const;
 *   }
 * }
 * ```
 */
export interface HasClassDefinitions {
  /**
   * Returns the class definitions to bind, as a list of pairs, or a
   * plain object in the 0.1 record form.
   */
  getClassDefinitions(): readonly ClassDefinition[] | LegacyClassDefinitions;
}

/**
 * PHPNomad's `PHPNomad\Loader\Interfaces\HasLoadCondition`. The loader
 * asks right after it hands the initializer the container, and skips
 * every later step for this initializer when the answer is false.
 *
 * Where this differs from PHPNomad: the answer may be a promise, since
 * a Node condition often needs a read, such as a stored setting. It
 * must be a boolean. Any other answer fails the load with a TypeError
 * naming the initializer, so a condition that forgets to return does
 * not quietly skip it. PHP without strict types turns a scalar answer
 * into a boolean and throws only for null, arrays and objects, so this
 * check is stricter than PHPNomad's. TypeScript does not force that,
 * and it is an open gap under TS Nomad Alignment With PHPNomad
 * (Charter 5012, https://navigator.novatori.us/r/charter/5012).
 */
export interface HasLoadCondition {
  shouldLoad(): boolean | Promise<boolean>;
}

/**
 * PHPNomad's `PHPNomad\Loader\Interfaces\Loadable`. The loader calls
 * `load()` last, after every other step for the same initializer, and
 * before it starts the next initializer.
 *
 * Where this differs from PHPNomad: `load()` may return a promise, and
 * the loader waits for it before going on.
 */
export interface Loadable {
  load(): void | Promise<void>;
}

/**
 * PHPNomad's `PHPNomad\Di\Interfaces\CanSetContainer`, which lives in
 * @tsnomad/di-container: `setContainer(container): this`.
 */
export { CanSetContainer } from '@tsnomad/di-container';

/**
 * PHPNomad's `PHPNomad\Events\Interfaces\HasListeners` and
 * `HasEventBindings`, which live in @tsnomad/event.
 */
export type { HasListeners, HasEventBindings } from '@tsnomad/event';

export type {
  TaskClass,
  CanHandleTask,
  TaskHandlerClass,
  TaskHandlerDefinition,
  HasTaskHandlers,
  ControllerClass,
  HasControllers,
} from './ports.js';

/**
 * What the bootstrapper accepts as one initializer: an object that
 * implements any subset of the interfaces above. Each method is
 * optional, and the bootstrapper checks for each one by name.
 *
 * `setContainer` takes the concrete `Container` and may return
 * anything, so a 0.1 initializer whose `setContainer` returns nothing
 * still fits. `getEventBindings` may also return the 0.1
 * `{ eventId, listener }` objects, which load as plain listeners.
 */
export interface Initializer {
  setContainer?(container: Container): unknown;
  shouldLoad?(): boolean | Promise<boolean>;
  getClassDefinitions?(): readonly ClassDefinition[] | LegacyClassDefinitions;
  getEventBindings?(): readonly (EventBindingDefinition | EventBinding)[];
  getListeners?(): ReturnType<HasListeners['getListeners']>;
  getTaskHandlers?(): readonly TaskHandlerDefinition[];
  getControllers?(): readonly ControllerClass[];
  load?(): void | Promise<void>;
}

/**
 * The 0.1 shape of `CanSetContainer`, kept so the guard below keeps its
 * 0.1 type.
 */
interface SetsContainer {
  setContainer(container: Container): unknown;
}

/**
 * Type guard for HasClassDefinitions.
 */
export function hasClassDefinitions(init: Initializer): init is HasClassDefinitions {
  return typeof (init as HasClassDefinitions).getClassDefinitions === 'function';
}

/**
 * Type guard for HasListeners.
 */
export function hasListeners(init: Initializer): init is HasListeners {
  return typeof (init as HasListeners).getListeners === 'function';
}

/**
 * Type guard for HasEventBindings, in either the PHPNomad pair form or
 * the 0.1 object form.
 */
export function hasEventBindings(
  init: Initializer
): init is { getEventBindings(): readonly (EventBindingDefinition | EventBinding)[] } {
  return typeof (init as HasEventBindings).getEventBindings === 'function';
}

/**
 * Type guard for Loadable.
 */
export function isLoadable(init: Initializer): init is Loadable {
  return typeof (init as Loadable).load === 'function';
}

/**
 * Type guard for CanSetContainer.
 */
export function canSetContainer(init: Initializer): init is SetsContainer {
  return typeof (init as SetsContainer).setContainer === 'function';
}

/**
 * Type guard for HasLoadCondition.
 */
export function hasLoadCondition(init: Initializer): init is HasLoadCondition {
  return typeof (init as HasLoadCondition).shouldLoad === 'function';
}

/**
 * Type guard for HasTaskHandlers.
 */
export function hasTaskHandlers(init: Initializer): init is HasTaskHandlers {
  return typeof (init as HasTaskHandlers).getTaskHandlers === 'function';
}

/**
 * Type guard for HasControllers.
 */
export function hasControllers(init: Initializer): init is HasControllers {
  return typeof (init as HasControllers).getControllers === 'function';
}
