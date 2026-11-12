/**
 * Acceptance tests, integration shape: 0.1 initializers keep loading.
 * These follow the shapes the five current consumers use: a record of
 * factories that binds the event strategy under the string
 * 'EventStrategy', plain listener records, a setContainer that returns
 * nothing, and the lazy registry pattern, where a factory broadcasts an
 * init event that a later initializer's listener answers.
 *
 * Packet P1 removes each `skip`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container } from '@tsnomad/di-container';
import { InMemoryEventStrategy } from '@tsnomad/event';
import type { Event } from '@tsnomad/event';
import { Bootstrapper } from '../dist/Bootstrapper.js';

class RegistryInit implements Event {
  static getId(): string {
    return 'strategy.registry.init';
  }
  readonly names: string[];
  constructor(names: string[]) {
    this.names = names;
  }
}

test.skip('an initializer that binds the event strategy in its record form serves its own listeners and later ones', async () => {
  const container = new Container();
  const heard: string[] = [];

  class CoreInitializer {
    container: Container | undefined = undefined;
    setContainer(container: Container): void {
      this.container = container;
    }
    getClassDefinitions() {
      return {
        EventStrategy: () => new InMemoryEventStrategy(),
        Names: () => [] as string[],
        Provider: async () => {
          const names = await this.container!.get<string[]>('Names');
          const events = await this.container!.get<InMemoryEventStrategy>('EventStrategy');
          await events.broadcast(new RegistryInit(names));
          return { names };
        },
      };
    }
    getListeners() {
      return {
        'strategy.registry.init': () => {
          heard.push('core');
        },
      };
    }
  }
  class HandlerInitializer {
    getListeners() {
      return {
        'strategy.registry.init': (event: RegistryInit) => {
          event.names.push('fast', 'slow');
        },
      };
    }
  }

  await new Bootstrapper(container, [new CoreInitializer(), new HandlerInitializer()]).bootstrap();
  const provider = await container.get<{ names: string[] }>('Provider');

  assert.deepEqual(provider.names, ['fast', 'slow']);
  assert.deepEqual(heard, ['core']);
});

test.skip('a 0.1 event with only an instance getId reaches a listener the loader attached by id', async () => {
  const container = new Container();
  const events = new InMemoryEventStrategy();
  container.bind('EventStrategy', () => events);
  class LegacyPing implements Event {
    getId(): string {
      return 'legacy.ping';
    }
  }
  const heard: string[] = [];

  await new Bootstrapper(container, [{ getListeners: () => ({ 'legacy.ping': () => {
    heard.push('ping');
  } }) }]).bootstrap();
  await events.broadcast(new LegacyPing());

  assert.deepEqual(heard, ['ping']);
});
