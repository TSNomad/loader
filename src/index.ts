/**
 * @tsnomad/loader
 *
 * Public entry point. Re-exports the bootstrapper, the base initializer,
 * the loader exception, and the initializer interfaces so consumers can
 * import everything from the package root.
 */

export { Bootstrapper, EVENT_STRATEGY_TOKEN } from './Bootstrapper.js';
export type { BootstrapOptions } from './Bootstrapper.js';
export { BaseInitializer } from './BaseInitializer.js';
export { LoaderException } from './LoaderException.js';
export { CanSetContainer } from './interfaces.js';
export type {
  ClassDefinition,
  LegacyClassDefinitions,
  HasClassDefinitions,
  HasLoadCondition,
  HasListeners,
  HasEventBindings,
  Loadable,
  Initializer,
  TaskClass,
  CanHandleTask,
  TaskHandlerClass,
  TaskHandlerDefinition,
  HasTaskHandlers,
  ControllerClass,
  HasControllers,
} from './interfaces.js';
export {
  hasClassDefinitions,
  hasListeners,
  hasEventBindings,
  isLoadable,
  canSetContainer,
  hasLoadCondition,
  hasTaskHandlers,
  hasControllers,
} from './interfaces.js';
export { TASK_STRATEGY_KEY, REST_STRATEGY_KEY } from './ports.js';
export type { LoaderTaskStrategy, LoaderRestStrategy } from './ports.js';
