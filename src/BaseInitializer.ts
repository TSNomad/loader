/**
 * Base Initializer
 *
 * Provides common setContainer implementation for initializers.
 *
 * NOTE: This uses inheritance which goes against PHPNomad's preference
 * for composition over inheritance. This is a known compromise until
 * a better TypeScript pattern emerges (TS lacks PHP traits).
 */

import type { Container } from '@tsnomad/di-container';
import type { CanSetContainer } from './interfaces.js';

/**
 * Base class for initializers that need container access.
 */
export abstract class BaseInitializer implements CanSetContainer {
  protected container!: Container;

  setContainer(container: Container): void {
    this.container = container;
  }
}
