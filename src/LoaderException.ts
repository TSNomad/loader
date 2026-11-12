/**
 * LoaderException
 *
 * PHPNomad's `PHPNomad\Loader\Exceptions\LoaderException`. The
 * bootstrapper throws it when an initializer fails to load because of a
 * container error, a `DiException` from @tsnomad/di-container. The
 * message is PHPNomad's, `Failed to load <initializer>`, and the
 * container error is the `cause`.
 *
 * Every other error passes through the bootstrapper unchanged, as in
 * PHPNomad, which wraps only a `DiException`.
 *
 * Where this differs from PHPNomad:
 * - PHP builds it from a message, the code 500 and the previous
 *   exception. Here the constructor takes the initializer's name, its
 *   position and the cause, and builds the message itself. The name and
 *   the position stay on the error as fields, so a caller that logs the
 *   failure can say which initializer it was without parsing text.
 * - There is no error code, because a JavaScript `Error` has none.
 */

export class LoaderException extends Error {
  /**
   * @param initializer - The initializer's class name, or
   *   'anonymous initializer' for a plain object
   * @param position - Where the initializer sits in the bootstrapper's
   *   list, counting from 1
   * @param cause - The error that stopped it
   */
  constructor(
    public readonly initializer: string,
    public readonly position: number,
    cause: unknown
  ) {
    super(`Failed to load ${initializer}`, { cause });
    this.name = 'LoaderException';
  }
}
