/**
 * TSNomad Bootstrapper
 *
 * Orchestrates application startup by processing initializers.
 * Handles container bindings, event listeners, and initialization hooks.
 *
 * Usage:
 * ```typescript
 * const container = new Container();
 *
 * // EventStrategy is just another binding
 * container.bind('EventStrategy', () => new EventStrategy());
 *
 * const bootstrapper = new Bootstrapper(container, [
 *   new CoreInitializer(),
 *   new DatabaseInitializer(),
 * ]);
 *
 * await bootstrapper.bootstrap();
 * ```
 */

import { Container } from '@tsnomad/di-container';
import type { EventStrategy } from '@tsnomad/event';
import type { Initializer } from './interfaces.js';
import {
  hasClassDefinitions,
  hasListeners,
  hasEventBindings,
  isLoadable,
  canSetContainer,
} from './interfaces.js';

/**
 * Well-known token for the EventStrategy binding.
 */
export const EVENT_STRATEGY_TOKEN = 'EventStrategy';

/**
 * Bootstrap options.
 */
export interface BootstrapOptions {
  /**
   * Token to use for EventStrategy lookup.
   * Default: 'EventStrategy'
   */
  eventStrategyToken?: string;
}

/**
 * Orchestrates application bootstrap.
 *
 * Stateless utility - can be reused to run different initializers
 * on the same or different containers.
 */
export class Bootstrapper {
  private readonly container: Container;
  private readonly initializers: Initializer[];

  /**
   * Creates a new bootstrapper.
   *
   * @param container - The DI container to populate
   * @param initializers - Initializers to process in order
   */
  constructor(container: Container, initializers: Initializer[]) {
    this.container = container;
    this.initializers = initializers;
  }

  /**
   * Runs the bootstrap process.
   *
   * Order of operations:
   * 1. Set container on initializers that need it
   * 2. Register class definitions in container
   * 3. Register event listeners (if events strategy is bound)
   * 4. Call load() hooks
   *
   * @param options - Bootstrap options
   */
  async bootstrap(options: BootstrapOptions = {}): Promise<void> {
    const { eventStrategyToken = EVENT_STRATEGY_TOKEN } = options;

    // Phase 1: Set container on initializers
    for (const initializer of this.initializers) {
      if (canSetContainer(initializer)) {
        initializer.setContainer(this.container);
      }
    }

    // Phase 2: Register class definitions
    for (const initializer of this.initializers) {
      if (hasClassDefinitions(initializer)) {
        const definitions = initializer.getClassDefinitions();

        for (const [token, factory] of Object.entries(definitions)) {
          this.container.bind(token, factory);
        }
      }
    }

    // Phase 3: Register event listeners (only if events strategy is bound)
    const hasEventRegistrations = this.initializers.some(
      (init) => hasListeners(init) || hasEventBindings(init)
    );

    if (hasEventRegistrations && this.container.has(eventStrategyToken)) {
      const events = await this.container.get<EventStrategy>(
        eventStrategyToken
      );

      for (const initializer of this.initializers) {
        // HasListeners style (record of event -> listener(s))
        if (hasListeners(initializer)) {
          const listeners = initializer.getListeners();

          for (const [eventId, listenerOrArray] of Object.entries(listeners)) {
            const listenerArray = Array.isArray(listenerOrArray)
              ? listenerOrArray
              : [listenerOrArray];

            for (const listener of listenerArray) {
              events.addListener(eventId, listener);
            }
          }
        }

        // HasEventBindings style (array of bindings)
        if (hasEventBindings(initializer)) {
          const bindings = initializer.getEventBindings();

          for (const binding of bindings) {
            events.addListener(binding.eventId, binding.listener);
          }
        }
      }
    }

    // Phase 4: Run load hooks
    for (const initializer of this.initializers) {
      if (isLoadable(initializer)) {
        await initializer.load();
      }
    }
  }

  /**
   * Gets the container.
   */
  getContainer(): Container {
    return this.container;
  }
}
