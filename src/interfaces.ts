/**
 * TSNomad Bootstrap Interfaces
 *
 * Interfaces for initializers that configure the application during bootstrap.
 * Following the PHPNomad pattern where modules declare their bindings and listeners.
 */

import type { Token, Factory, Container } from '@tsnomad/di-container';
import type { Listener, EventBinding } from '@tsnomad/event';

/**
 * Provides class definitions for the DI container.
 *
 * Implement this to register services in the container:
 * ```typescript
 * class MyInitializer implements HasClassDefinitions {
 *   getClassDefinitions() {
 *     return {
 *       'Logger': () => new ConsoleLogger(),
 *       'Database': async () => await connectDb(),
 *     };
 *   }
 * }
 * ```
 */
export interface HasClassDefinitions {
  /**
   * Returns bindings to register in the container.
   * Keys are tokens, values are factory functions.
   */
  getClassDefinitions(): Record<Token, Factory<unknown>>;
}

/**
 * Provides event listeners.
 *
 * Implement this to register event handlers:
 * ```typescript
 * class MyInitializer implements HasListeners {
 *   getListeners() {
 *     return {
 *       'user.created': (event) => console.log('User created'),
 *       'user.deleted': [onDelete, cleanupFiles],
 *     };
 *   }
 * }
 * ```
 */
export interface HasListeners {
  /**
   * Returns listeners to register.
   * Keys are event IDs, values are listeners or arrays of listeners.
   */
  getListeners(): Record<string, Listener<any> | Listener<any>[]>;
}

/**
 * Provides event bindings (alternative to HasListeners).
 *
 * Use this when you need more control over binding configuration:
 * ```typescript
 * class MyInitializer implements HasEventBindings {
 *   getEventBindings() {
 *     return [
 *       { eventId: 'user.created', listener: this.onUserCreated },
 *     ];
 *   }
 * }
 * ```
 */
export interface HasEventBindings {
  /**
   * Returns event bindings to register.
   */
  getEventBindings(): EventBinding[];
}

/**
 * Runs custom initialization logic after binding registration.
 *
 * Use this for setup that needs to happen after the container is populated
 * but before the application starts:
 * ```typescript
 * class MyInitializer implements Loadable {
 *   async load() {
 *     await this.warmCache();
 *     await this.validateConfig();
 *   }
 * }
 * ```
 */
export interface Loadable {
  /**
   * Called after all bindings and listeners are registered.
   * Can be async for setup that requires I/O.
   */
  load(): void | Promise<void>;
}

/**
 * Receives the container instance.
 *
 * Implement this if your initializer needs access to the container:
 * ```typescript
 * class MyInitializer implements CanSetContainer {
 *   private container!: Container;
 *
 *   setContainer(container: Container) {
 *     this.container = container;
 *   }
 * }
 * ```
 */
export interface CanSetContainer {
  /**
   * Called with the container instance before other methods.
   */
  setContainer(container: Container): void;
}

/**
 * Combined type for initializers that can implement any subset of interfaces.
 */
export type Initializer = Partial<
  HasClassDefinitions &
    HasListeners &
    HasEventBindings &
    Loadable &
    CanSetContainer
>;

/**
 * Type guard for HasClassDefinitions.
 */
export function hasClassDefinitions(
  init: Initializer
): init is HasClassDefinitions {
  return typeof (init as HasClassDefinitions).getClassDefinitions === 'function';
}

/**
 * Type guard for HasListeners.
 */
export function hasListeners(init: Initializer): init is HasListeners {
  return typeof (init as HasListeners).getListeners === 'function';
}

/**
 * Type guard for HasEventBindings.
 */
export function hasEventBindings(init: Initializer): init is HasEventBindings {
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
export function canSetContainer(init: Initializer): init is CanSetContainer {
  return typeof (init as CanSetContainer).setContainer === 'function';
}
