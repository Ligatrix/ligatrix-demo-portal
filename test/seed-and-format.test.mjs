import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeedStore, DEMO_COMPANY } from '../src/domain/seed.mjs';
import { countByState } from '../src/domain/metrics.mjs';
import { formatCents, formatDuration, formatTimestamp } from '../src/domain/format.mjs';

test('the seed has twelve requests covering every state and type', () => {
  const store = buildSeedStore();
  assert.equal(store.requests.length, 12);
  const counts = countByState(store.requests);
  for (const state of Object.keys(counts)) assert.ok(counts[state] > 0, `no seeded request is ${state}`);
  assert.deepEqual([...new Set(store.requests.map((r) => r.type))].sort(), ['access', 'purchase', 'supplier_onboarding']);
});

test('the seed is deterministic and its log is in time order', () => {
  assert.deepEqual(buildSeedStore(), buildSeedStore());
  const times = buildSeedStore().log.map((entry) => Date.parse(entry.at));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('the demo company is labelled as fictional', () => {
  assert.match(DEMO_COMPANY, /fictional/);
});

test('formatCents writes US dollars and blanks for missing values', () => {
  assert.equal(formatCents(486000), '$4,860.00');
  assert.equal(formatCents(null), '');
});

test('formatDuration picks the two most useful units', () => {
  assert.equal(formatDuration(30_000), 'under 1m');
  assert.equal(formatDuration(45 * 60_000), '45m');
  assert.equal(formatDuration(3 * 3_600_000), '3h');
  assert.equal(formatDuration(3 * 3_600_000 + 12 * 60_000), '3h 12m');
  assert.equal(formatDuration(52 * 3_600_000), '2d 4h');
  assert.equal(formatDuration(48 * 3_600_000), '2d');
  assert.equal(formatDuration(-1), 'n/a');
  assert.equal(formatDuration(null), 'n/a');
});

test('formatTimestamp is in UTC and empty for invalid input', () => {
  assert.equal(formatTimestamp('2026-11-18T09:05:00Z'), 'Nov 18, 2026, 9:05 AM UTC');
  assert.equal(formatTimestamp('not a date'), '');
});
