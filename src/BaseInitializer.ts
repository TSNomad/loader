/**
 * Base Initializer
 *
 * Provides common setContainer implementation for initializers.
 *
 * NOTE: This uses inheritance which goes against PHPNomad's preference
 * for composition over inheritance. This is a known compromise until
 * a better TypeScript pattern emerges (TS lacks PHP traits). It stands
 * in for PHPNomad's `HasSettableContainer` trait.
 */

import type { Container } from '@tsnomad/di-container';
import type { CanSetContainer } from '@tsnomad/di-container';

/**
 * Base class for initializers that need container access.
 */
export abstract class BaseInitializer implements CanSetContainer {
  protected container!: Container;

  /**
   * Keeps the container. Returns this, as PHPNomad's `setContainer` does.
   */
  setContainer(container: Container): this {
    this.container = container;
    return this;
  }
}
