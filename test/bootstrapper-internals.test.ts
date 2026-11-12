/**
 * Unit tests for Bootstrapper internals the acceptance tests leave open.
 * Written by packet P1. The P1 mutation list showed that no acceptance
 * test awaits two strategy calls in step 4: `bindAction` with a
 * transformer, and the event strategy's `attach` for a 0.1
 * `{ eventId, listener }` entry. The contract says the bootstrapper
 * awaits every strategy call's promise, so these pin both.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bootstrapper } from '../dist/Bootstrapper.js';
import { OrderPlaced, traced, wire } from './fixtures.ts';

test('a promise bindAction returns for an action with a transformer is awaited, so its rejection stops the load', async () => {
  const wiring = wire();
  const boom = new Error('bindAction with a transformer failed');
  wiring.actions.answer = Promise.reject(boom);
  (wiring.actions.answer as Promise<void>).catch(() => {});
  const after = traced(wiring.log, 'After', { setContainer: true });
  const initializer = {
    getEventBindings: () => [[OrderPlaced, { action: 'order.completed', transformer: (id: string) => new OrderPlaced(id) }]],
  };

  await assert.rejects(new Bootstrapper(wiring.container, [initializer as any, after]).load(), (error) => error === boom);
  assert.equal(wiring.log.includes('After.setContainer'), false);
});

test('a promise the event strategy returns for a 0.1 { eventId, listener } entry is awaited, so its rejection stops the load', async () => {
  const wiring = wire();
  const boom = new Error('attach failed');
  wiring.events.attach = (() => Promise.reject(boom)) as any;
  const after = traced(wiring.log, 'After', { setContainer: true });
  const initializer = { getEventBindings: () => [{ eventId: 'user.created', listener: () => {} }] };

  await assert.rejects(new Bootstrapper(wiring.container, [initializer as any, after]).load(), (error) => error === boom);
  assert.equal(wiring.log.includes('After.setContainer'), false);
});
