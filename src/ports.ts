/**
 * Task and controller shapes the loader reads
 *
 * PHPNomad's loader reads `HasTaskHandlers` from phpnomad/tasks and
 * `HasControllers` from phpnomad/rest, and calls `TaskStrategy::attach`
 * and `RestStrategy::registerRoute`. Composer never installs those
 * packages for the loader: PHP's `instanceof` against an interface that
 * is not installed is simply false.
 *
 * TS Nomad has no @tsnomad/tasks or @tsnomad/rest yet. Slice 8 of the
 * Siren Node connectors build writes them. So this file declares the
 * part of each that the loader touches, under the names PHPNomad uses,
 * and the loader resolves each strategy by the name its token will
 * carry, 'TaskStrategy' and 'RestStrategy'. A typed token shares a
 * binding with a string of its name, so `createToken<TaskStrategy>('TaskStrategy')`
 * in @tsnomad/tasks and the key here reach the same binding.
 *
 * The packages slice 8 writes own the full interfaces. Their
 * `HasTaskHandlers`, `HasControllers`, `CanHandleTask`, `TaskStrategy`
 * and `RestStrategy` must stay assignable to the shapes here, and slice
 * 8 carries a compile-only test that says so.
 */

/**
 * The key the loader resolves the task strategy by. @tsnomad/tasks
 * names its `TaskStrategy` token the same.
 */
export const TASK_STRATEGY_KEY = 'TaskStrategy';

/**
 * The key the loader resolves the REST strategy by. @tsnomad/rest names
 * its `RestStrategy` token the same.
 */
export const REST_STRATEGY_KEY = 'RestStrategy';

/**
 * A task class, PHP's `Task::class`: a class whose static `getId()`
 * names the task. @tsnomad/tasks adds `toPayload` and `fromPayload`.
 */
export type TaskClass = (abstract new (...args: any[]) => object) & {
  getId(): string;
};

/**
 * PHPNomad's `PHPNomad\Tasks\Interfaces\CanHandleTask`: runs one task.
 *
 * A handler may run more than once for the same task, because a task
 * strategy retries a failed task. Work that must happen once keys its
 * idempotency on the task's own data and dedupes at the write, in one
 * atomic step.
 */
export interface CanHandleTask<T extends object = object> {
  handle(task: T): void | Promise<void>;
}

/**
 * A class whose instances handle tasks. The loader resolves it from the
 * container each time its task runs, as PHPNomad's loader does with
 * `$container->get($handlerClass)->handle($task)`.
 */
export type TaskHandlerClass<T extends object = any> = abstract new (...args: any[]) => CanHandleTask<T>;

/**
 * One entry of `getTaskHandlers()`: a task class and the handler class,
 * or handler classes, that run it.
 *
 * Where this differs from PHPNomad: PHP returns
 * `[TaskClass::class => Handler::class]`. A TypeScript object key cannot
 * be a class, so an entry is a pair.
 */
export type TaskHandlerDefinition = readonly [
  task: TaskClass,
  handlers: TaskHandlerClass | readonly TaskHandlerClass[],
];

/**
 * PHPNomad's `PHPNomad\Tasks\Interfaces\HasTaskHandlers`.
 */
export interface HasTaskHandlers {
  getTaskHandlers(): readonly TaskHandlerDefinition[];
}

/**
 * The part of PHPNomad's `PHPNomad\Tasks\Interfaces\TaskStrategy` the
 * loader calls. The strategy calls the handler with each task it runs
 * and treats a rejected promise as a failed task.
 *
 * Where this differs from PHPNomad: `attach` may return a promise, for
 * a platform whose registration is async, and the loader waits for it.
 */
export interface LoaderTaskStrategy {
  attach(taskClass: TaskClass, handler: (task: any) => Promise<void>): void | Promise<void>;
}

/**
 * A controller class. @tsnomad/rest's `Controller` declares
 * `getEndpoint`, `getMethod` and `getResponse`.
 */
export type ControllerClass = abstract new (...args: any[]) => object;

/**
 * PHPNomad's `PHPNomad\Rest\Interfaces\HasControllers`.
 */
export interface HasControllers {
  getControllers(): readonly ControllerClass[];
}

/**
 * The part of PHPNomad's `PHPNomad\Rest\Interfaces\RestStrategy` the
 * loader calls. The strategy calls the getter when a request needs the
 * controller, as PHPNomad's `registerRoute(fn() => $container->get($controller))`.
 *
 * Where this differs from PHPNomad: the getter answers a promise,
 * because `get` is async, and `registerRoute` may return a promise,
 * which the loader waits for.
 */
export interface LoaderRestStrategy {
  registerRoute(getController: () => Promise<object>): void | Promise<void>;
}
