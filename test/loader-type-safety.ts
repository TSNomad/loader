/**
 * Compile-only checks for the loader's contracts. Not a runtime test.
 * Everything sits inside functions that never run, so `node --test`
 * reports this file as an empty pass, and `npm run typecheck` is what
 * makes it matter. Each `@ts-expect-error` line must stay an error, and
 * every other line must keep compiling.
 */

import { Container, createToken } from '@tsnomad/di-container';
import type { Factory, Token } from '@tsnomad/di-container';
import type { CanHandle, Event, Listener } from '@tsnomad/event';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { BaseInitializer } from '../dist/BaseInitializer.js';
import type {
  CanSetContainer,
  ClassDefinition,
  HasClassDefinitions,
  HasControllers,
  HasEventBindings,
  HasListeners,
  HasLoadCondition,
  HasTaskHandlers,
  Initializer,
  Loadable,
  LoaderRestStrategy,
  LoaderTaskStrategy,
  TaskHandlerDefinition,
} from '../dist/index.js';
import { OrderPlaced, SendSale, UserCreated } from './fixtures.ts';

interface Store {
  read(): string;
}
const Store = createToken<Store>('Store');
class MemoryStore implements Store {
  read(): string {
    return '';
  }
}
class Welcome implements CanHandle<UserCreated> {
  handle(event: UserCreated): void {
    void event;
  }
}
class SendSaleHandler {
  handle(task: SendSale): void {
    void task;
  }
}
class ReceiveController {}

/** Every PHPNomad initializer interface, implemented by one class. */
class Everything
  implements HasClassDefinitions, HasLoadCondition, HasEventBindings, HasListeners, HasTaskHandlers, HasControllers, Loadable
{
  shouldLoad(): boolean {
    return true;
  }
  getClassDefinitions() {
    return [
      [MemoryStore, Store],
      [MemoryStore, [Store, 'store']],
    ] as const;
  }
  getEventBindings() {
    return [[OrderPlaced, 'order.placed']] as const;
  }
  getListeners() {
    return { [UserCreated.getId()]: [Welcome, (event: UserCreated) => void event] };
  }
  getTaskHandlers(): readonly TaskHandlerDefinition[] {
    return [[SendSale, SendSaleHandler]];
  }
  getControllers() {
    return [ReceiveController];
  }
  async load(): Promise<void> {}
}

/** An async condition. */
class AsyncCondition implements HasLoadCondition {
  async shouldLoad(): Promise<boolean> {
    return false;
  }
}

/** The 0.1 shapes the five consumers use, which must keep compiling. */
class LegacyService extends BaseInitializer implements HasClassDefinitions, HasListeners {
  getClassDefinitions(): Record<Token, Factory<unknown>> {
    return { Logger: () => ({}) };
  }
  getListeners(): Record<string, Listener<Event>> {
    return { 'user.created': () => {} };
  }
}
class LegacySetsContainer {
  setContainer(container: Container): void {
    void container;
  }
  getEventBindings() {
    return [{ eventId: 'user.created', listener: () => {} }];
  }
}

export function loaderChecks(container: Container): void {
  void new Bootstrapper(container, [new Everything(), new AsyncCondition(), new LegacyService(), new LegacySetsContainer()]);
  void new Bootstrapper(container, new Everything(), new LegacyService());
  void new Bootstrapper(container);
  const definition: ClassDefinition = [MemoryStore, Store];
  void definition;

  // @ts-expect-error a number is not an initializer
  void new Bootstrapper(container, [42]);

  // @ts-expect-error an initializer with no loader method is not an initializer
  void new Bootstrapper(container, { start: () => {} });

  const fromBase: CanSetContainer = new LegacyService();
  void fromBase;
}

class StringCondition implements HasLoadCondition {
  // @ts-expect-error shouldLoad answers a boolean
  shouldLoad(): string {
    return 'yes';
  }
}
void StringCondition;

class ConcreteIsAString implements HasClassDefinitions {
  getClassDefinitions(): readonly ClassDefinition[] {
    // @ts-expect-error a concrete is a class
    return [['MemoryStore', Store]];
  }
}
void ConcreteIsAString;

class AbstractConcrete implements HasClassDefinitions {
  getClassDefinitions(): readonly ClassDefinition[] {
    abstract class Abstracted {}
    // @ts-expect-error a concrete is a class the container can construct, not an abstract class
    return [[Abstracted, Store]];
  }
}
void AbstractConcrete;

class ListenerIsANumber implements HasListeners {
  getListeners(): ReturnType<HasListeners['getListeners']> {
    return {
      // @ts-expect-error a listener entry is a handler class or a function
      'user.created': 42,
    };
  }
}
void ListenerIsANumber;

class TaskIsAString implements HasTaskHandlers {
  getTaskHandlers(): readonly TaskHandlerDefinition[] {
    // @ts-expect-error a task is a class with a static getId
    return [['send-sale', SendSaleHandler]];
  }
}
void TaskIsAString;

class TaskHandlerWithoutHandle implements HasTaskHandlers {
  getTaskHandlers(): readonly TaskHandlerDefinition[] {
    // @ts-expect-error a task handler class has a handle method
    return [[SendSale, ReceiveController]];
  }
}
void TaskHandlerWithoutHandle;

class ControllerIsAString implements HasControllers {
  // @ts-expect-error a controller is a class
  getControllers() {
    return ['ReceiveController'];
  }
}
void ControllerIsAString;

class LoadAnswersAValue implements Loadable {
  // @ts-expect-error load answers nothing, sync or async
  load(): number {
    return 1;
  }
}
void LoadAnswersAValue;

/** What slice 8's strategies must stay assignable to. */
export function strategyShapes(tasks: LoaderTaskStrategy, rest: LoaderRestStrategy): void {
  void tasks.attach(SendSale, async (task: SendSale) => void task);
  void rest.registerRoute(async () => new ReceiveController());
  // @ts-expect-error attach takes a task class
  void tasks.attach('send-sale', async () => {});
  // @ts-expect-error a route getter answers a promise
  void rest.registerRoute(() => new ReceiveController());
}

export function initializerType(init: Initializer): void {
  void init.shouldLoad?.();
}
