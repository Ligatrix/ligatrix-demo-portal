import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, createRequest, applyAction, nextRequestId, nextEventId, findRequest } from '../src/domain/store-core.mjs';
import { NOW, purchaseInput } from '../test-support/fixtures.mjs';

test('ids continue from the highest one in use, not the count', () => {
  assert.equal(nextRequestId([]), 'REQ-1001');
  assert.equal(nextRequestId([{ id: 'REQ-1001' }, { id: 'REQ-1009' }]), 'REQ-1010');
  assert.equal(nextEventId([]), 'EVT-000001');
  assert.equal(nextEventId([{ id: 'EVT-000041' }]), 'EVT-000042');
});

test('createRequest adds a new request and a created entry without touching the old store', () => {
  const before = emptyStore();
  const { store, request, entry } = createRequest(before, purchaseInput(), { now: NOW });
  assert.equal(before.requests.length, 0);
  assert.equal(store.requests.length, 1);
  assert.equal(request.state, 'new');
  assert.equal(request.createdAt, NOW);
  assert.equal(entry.action, 'created');
  assert.equal(entry.actor, 'Leo');
  assert.equal(entry.requestId, request.id);
});

test('createRequest throws a validation error carrying field messages', () => {
  assert.throws(
    () => createRequest(emptyStore(), purchaseInput({ amount: 'lots' }), { now: NOW }),
    (error) => error.code === 'validation_failed' && typeof error.details.fields.amount === 'string',
  );
});

test('createRequest needs a valid timestamp', () => {
  assert.throws(() => createRequest(emptyStore(), purchaseInput(), { now: 'soon' }), /timestamp/);
});

test('applyAction runs the full approval path and logs every step', () => {
  let { store, request } = createRequest(emptyStore(), purchaseInput(), { now: NOW });
  store = applyAction(store, request.id, 'start_review', { actor: 'Dana', now: '2026-11-24T11:00:00Z' }).store;
  store = applyAction(store, request.id, 'approve', { actor: 'Dana', comment: 'OK', now: '2026-11-24T12:00:00Z' }).store;
  const result = applyAction(store, request.id, 'complete', { actor: 'Leo', now: '2026-11-24T13:00:00Z' });
  assert.equal(findRequest(result.store, request.id).state, 'done');
  assert.deepEqual(result.store.log.map((entry) => entry.action), ['created', 'start_review', 'approve', 'complete']);
  assert.deepEqual(result.store.log.map((entry) => entry.id), ['EVT-000001', 'EVT-000002', 'EVT-000003', 'EVT-000004']);
});

test('applyAction on an unknown id is a not-found error', () => {
  assert.throws(
    () => applyAction(emptyStore(), 'REQ-9999', 'start_review', { actor: 'Dana', now: NOW }),
    (error) => error.code === 'not_found',
  );
});

test('a refused action leaves the store unchanged', () => {
  const { store, request } = createRequest(emptyStore(), purchaseInput(), { now: NOW });
  const snapshot = structuredClone(store);
  assert.throws(() => applyAction(store, request.id, 'approve', { actor: 'Dana', now: NOW }));
  assert.deepEqual(store, snapshot);
});
