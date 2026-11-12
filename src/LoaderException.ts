/**
 * LoaderException
 *
 * PHPNomad's `PHPNomad\Loader\Exceptions\LoaderException`. The
 * bootstrapper throws it when an initializer fails to load because of a
 * container error, a `DiException` from @tsnomad/di-container, or
 * because the initializer answered one of the loader's questions with
 * the wrong shape. The original error is the `cause`.
 *
 * Every other error passes through the bootstrapper unchanged, as in
 * PHPNomad, which wraps only a `DiException`.
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
    super(`Failed to load ${initializer} (position ${position}): ${LoaderException.messageOf(cause)}`, { cause });
    this.name = 'LoaderException';
  }

  private static messageOf(cause: unknown): string {
    if (cause instanceof Error) {
      return cause.message;
    }
    return String(cause);
  }
}
