/**
 * Shape checks the bootstrapper runs on an initializer's answers.
 *
 * Internal to the loader. The package root does not export this module
 * and the package's `exports` map does not name it, so it is not part
 * of the public surface. Each helper is pure, so the unit tests in
 * `test/shapes.test.ts` check it on its own.
 */

/**
 * True for an object whose prototype is `Object.prototype` or null: an
 * object literal, or `Object.create(null)`. A class instance, an array,
 * a `Map`, a promise and a function are not plain.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * True for a function that `new` can call: a class, or an ES5
 * constructor function. Arrow functions, async functions and methods
 * have no `prototype` object, so they are not constructable.
 */
export function isConstructable(value: unknown): value is abstract new (...args: any[]) => object {
  return typeof value === 'function' && typeof (value as { prototype?: unknown }).prototype === 'object' && (value as { prototype?: unknown }).prototype !== null;
}

/**
 * True for a handler class: a function whose `prototype.handle` is a
 * function, written with `class` or as an ES5 constructor. This is the
 * first of the contract's two checks for a listener entry.
 */
export function isHandlerClass(value: unknown): value is abstract new (...args: any[]) => { handle(subject: unknown): unknown } {
  return isConstructable(value) && typeof (value.prototype as { handle?: unknown }).handle === 'function';
}

/**
 * True for a function written with `class` syntax, read from its
 * source with `Function.prototype.toString`. This is the second of the
 * contract's two checks for a listener entry, run only when the first
 * fails: such a function is a class with no `handle` method.
 */
export function isClassSyntax(value: unknown): boolean {
  return typeof value === 'function' && Function.prototype.toString.call(value).startsWith('class');
}

/**
 * The name an error gives an initializer: its constructor's name, or
 * 'anonymous initializer' for a plain object or a class with no name.
 */
export function initializerName(initializer: unknown): string {
  if (isPlainObject(initializer)) {
    return 'anonymous initializer';
  }
  const name = (initializer as { constructor?: { name?: unknown } } | null | undefined)?.constructor?.name;
  return typeof name === 'string' && name !== '' ? name : 'anonymous initializer';
}

/**
 * A short description of a value for an error message, such as
 * `undefined`, `an array`, `a Map`, `class Store` or `the string "x"`.
 */
export function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return `an array of length ${value.length}`;
  }
  if (typeof value === 'string') {
    return `the string ${JSON.stringify(value)}`;
  }
  if (typeof value === 'function') {
    const name = value.name === '' ? '' : ` ${value.name}`;
    return isClassSyntax(value) ? `class${name}` : `function${name}`;
  }
  if (typeof value === 'object') {
    if (isPlainObject(value)) {
      return 'a plain object';
    }
    const name = (value as { constructor?: { name?: unknown } }).constructor?.name;
    return typeof name === 'string' && name !== '' ? `a ${name}` : 'an object';
  }
  return `the ${typeof value} ${String(value)}`;
}
