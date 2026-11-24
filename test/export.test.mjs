import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandover, validateStore, storeFromBundle, handoverFilename, BUNDLE_FORMAT } from '../src/domain/export.mjs';
import { buildSeedStore } from '../src/domain/seed.mjs';
import { SCHEMA_VERSION } from '../src/domain/store-core.mjs';
import { NOW } from '../test-support/fixtures.mjs';

test('the handover bundle carries format, version, schema, summary, requests and log', () => {
  const store = buildSeedStore();
  const bundle = buildHandover(store, { exportedAt: NOW });
  assert.equal(bundle.format, BUNDLE_FORMAT);
  assert.equal(bundle.schemaVersion, SCHEMA_VERSION);
  assert.equal(bundle.exportedAt, NOW);
  assert.deepEqual(bundle.schema.transitions.approve, { from: 'in_review', to: 'approved' });
  assert.ok(bundle.schema.requestFields.amountCents);
  assert.equal(bundle.summary.total, store.requests.length);
  assert.equal(bundle.requests.length, store.requests.length);
  assert.equal(bundle.log.length, store.log.length);
});

test('the bundle is a copy and survives a JSON round trip', () => {
  const store = buildSeedStore();
  const bundle = buildHandover(store, { exportedAt: NOW });
  bundle.requests[0].title = 'changed';
  assert.notEqual(store.requests[0].title, 'changed');
  const restored = storeFromBundle(JSON.parse(JSON.stringify(buildHandover(store, { exportedAt: NOW }))));
  assert.deepEqual(restored, store);
});

test('buildHandover refuses a missing export time', () => {
  assert.throws(() => buildHandover(buildSeedStore(), {}), TypeError);
});

test('validateStore accepts the seed and rejects the wrong schema version', () => {
  assert.deepEqual(validateStore(buildSeedStore()), { ok: true, errors: [] });
  const result = validateStore({ ...buildSeedStore(), schemaVersion: 2 });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /schemaVersion/);
});

test('validateStore catches non-objects and missing arrays', () => {
  assert.equal(validateStore(null).ok, false);
  assert.equal(validateStore({ schemaVersion: 1, requests: {}, log: [] }).ok, false);
});

test('validateStore catches duplicate ids, orphan log entries and state drift', () => {
  const store = buildSeedStore();
  store.requests.push({ ...store.requests[0] });
  store.log.push({ ...store.log[0], id: 'EVT-999999', requestId: 'REQ-4040' });
  store.requests[2].state = 'done';
  const { ok, errors } = validateStore(store);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /repeats id REQ-1001/.test(e)));
  assert.ok(errors.some((e) => /unknown request REQ-4040/.test(e)));
  assert.ok(errors.some((e) => /REQ-1003 is "done" but its log ends at "approved"/.test(e)));
});

test('storeFromBundle throws with every problem attached', () => {
  assert.throws(() => storeFromBundle({ schemaVersion: 1, requests: [{ id: 'bad' }], log: [] }), (error) => error.errors.length >= 3);
});

test('handoverFilename is a compact UTC stamp', () => {
  assert.equal(handoverFilename('2026-11-24T10:15:30.123Z'), 'corvane-handover-20261124T101530Z.json');
});
