/**
 * @tsnomad/loader
 *
 * Public entry point. Re-exports the bootstrapper, the base initializer,
 * and the initializer interfaces so consumers can import everything from
 * the package root.
 */

export { Bootstrapper, EVENT_STRATEGY_TOKEN } from './Bootstrapper.js';
export type { BootstrapOptions } from './Bootstrapper.js';
export { BaseInitializer } from './BaseInitializer.js';
export type {
  HasClassDefinitions,
  HasListeners,
  HasEventBindings,
  Loadable,
  CanSetContainer,
  Initializer,
} from './interfaces.js';
export {
  hasClassDefinitions,
  hasListeners,
  hasEventBindings,
  isLoadable,
  canSetContainer,
} from './interfaces.js';
