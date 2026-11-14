# One loosening per @ts-expect-error directive in test/loader-type-safety.ts,
# plus three controls. Scored by types-mutate.py.
I = 'src/interfaces.ts'
P = 'src/ports.ts'
B = 'src/Bootstrapper.ts'
COND = "export interface HasLoadCondition {\n  shouldLoad(): boolean | Promise<boolean>;\n}"
MUTATIONS = [
  ('TC1-must-catch: shouldLoad answers anything', I, [("  shouldLoad(): boolean | Promise<boolean>;\n}", "  shouldLoad(): unknown;\n}"), ("  shouldLoad?(): boolean | Promise<boolean>;", "  shouldLoad?(): unknown;")], None, ['shouldLoad answers a boolean']),
  ('TC2-must-survive: comment only', I, COND, "// harmless\n" + COND, 'survive'),
  ('TC3-must-refuse: syntax break', I, COND, COND + "(", 'refuse'),
  ('TI1 the variadic form takes any object', B, [("  constructor(container: Container, ...initializers: Initializer[]);", "  constructor(container: Container, ...initializers: object[]);"), ("...initializers: Initializer[] | [readonly Initializer[]]) {", "...initializers: object[] | [readonly Initializer[]]) {")], None, ['an initializer with no loader method', 'a number is not an initializer']),  # an array is an object too
  ('TI2 the array form takes numbers', B, [("  constructor(container: Container, initializers: readonly Initializer[]);", "  constructor(container: Container, initializers: readonly (Initializer | number)[]);"), ("...initializers: Initializer[] | [readonly Initializer[]]) {", "...initializers: Initializer[] | [readonly (Initializer | number)[]]) {")], None, ['a number is not an initializer']),
  ('TD1 a concrete may be a string', I, "  concrete: Constructor<object>,", "  concrete: Constructor<object> | string,", ['a concrete is a class, not a string']),
  ('TD2 a concrete may be abstract', I, "  concrete: Constructor<object>,", "  concrete: abstract new (...args: any[]) => object,", ['not an abstract class']),
  ('TL1 the loader declares a loose HasListeners', I, [("import type { EventBinding, EventBindingDefinition, HasEventBindings, HasListeners } from '@tsnomad/event';", "import type { EventBinding, EventBindingDefinition, HasEventBindings } from '@tsnomad/event';"), ("export type { HasListeners, HasEventBindings } from '@tsnomad/event';",
   "export interface HasListeners {\n  getListeners(): Record<string, unknown>;\n}\nexport type { HasEventBindings } from '@tsnomad/event';")], None, ['a listener entry is a handler class or a function']),
  ('TT1 a task may be a string', P, "  task: TaskClass,", "  task: TaskClass | string,", ['a task is a class with a static getId']),
  ('TT2 a task handler needs no handle', P, "export type TaskHandlerClass<T extends object = any> = abstract new (...args: any[]) => CanHandleTask<T>;",
   "export type TaskHandlerClass<T extends object = any> = abstract new (...args: any[]) => object;", ['a task handler class has a handle method']),
  ('TR1 a controller may be a string', P, "export type ControllerClass = abstract new (...args: any[]) => object;", "export type ControllerClass = (abstract new (...args: any[]) => object) | string;", ['a controller is a class']),
  ('TO1 load answers anything', I, [("export interface Loadable {\n  load(): void | Promise<void>;", "export interface Loadable {\n  load(): unknown;"), ("  load?(): void | Promise<void>;", "  load?(): unknown;")], None, ['load answers nothing']),
  ('TS1 task attach takes a string', P, "  attach(taskClass: TaskClass, handler:", "  attach(taskClass: TaskClass | string, handler:", ['attach takes a task class']),
  ('TS2 a route getter may answer the controller', P, "  registerRoute(getController: () => Promise<object>): void | Promise<void>;", "  registerRoute(getController: () => object | Promise<object>): void | Promise<void>;", ['a route getter answers a promise']),
]
