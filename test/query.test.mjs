import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterRequests, sortRequests, activityFor } from '../src/domain/query.mjs';
import { requestRecord } from '../test-support/fixtures.mjs';

const requests = [
  requestRecord({ id: 'REQ-1001', title: 'Pallet jacks', createdAt: '2026-11-01T00:00:00Z', amountCents: 486000, priority: 'high' }),
  requestRecord({ id: 'REQ-1002', title: 'Ledger access', type: 'access', vendor: null, system: 'Accounts payable ledger', amountCents: null, state: 'in_review', createdAt: '2026-11-03T00:00:00Z', priority: 'low' }),
  requestRecord({ id: 'REQ-1003', title: 'Onboard carrier', type: 'supplier_onboarding', vendor: 'Halvern Freight Lines', amountCents: null, requester: 'Owen', createdAt: '2026-11-02T00:00:00Z' }),
];

test('no filters returns everything, newest first', () => {
  assert.deepEqual(filterRequests(requests).map((r) => r.id), ['REQ-1002', 'REQ-1003', 'REQ-1001']);
});

test('filters by state and by type, ignoring unknown values', () => {
  assert.deepEqual(filterRequests(requests, { state: 'in_review' }).map((r) => r.id), ['REQ-1002']);
  assert.deepEqual(filterRequests(requests, { type: 'supplier_onboarding' }).map((r) => r.id), ['REQ-1003']);
  assert.equal(filterRequests(requests, { state: 'archived', type: 'travel' }).length, 3);
});

test('search is case-insensitive, matches every word, and covers id, supplier, system and requester', () => {
  assert.deepEqual(filterRequests(requests, { q: 'HALVERN' }).map((r) => r.id), ['REQ-1003']);
  assert.deepEqual(filterRequests(requests, { q: 'req-1001' }).map((r) => r.id), ['REQ-1001']);
  assert.deepEqual(filterRequests(requests, { q: 'payable ledger' }).map((r) => r.id), ['REQ-1002']);
  assert.deepEqual(filterRequests(requests, { q: 'owen carrier' }).map((r) => r.id), ['REQ-1003']);
  assert.equal(filterRequests(requests, { q: 'owen jacks' }).length, 0);
});

test('sorts by oldest, amount and priority with stable fallbacks', () => {
  assert.deepEqual(sortRequests(requests, 'oldest').map((r) => r.id), ['REQ-1001', 'REQ-1003', 'REQ-1002']);
  assert.equal(sortRequests(requests, 'amount')[0].id, 'REQ-1001');
  assert.deepEqual(sortRequests(requests, 'priority').map((r) => r.id), ['REQ-1001', 'REQ-1003', 'REQ-1002']);
});

test('sorting never reorders the input array', () => {
  const copy = [...requests];
  sortRequests(requests, 'oldest');
  assert.deepEqual(requests, copy);
});

test('activityFor returns newest first, per request, with a limit', () => {
  const log = [
    { id: 'EVT-000001', at: '2026-11-01T00:00:00Z', requestId: 'REQ-1001' },
    { id: 'EVT-000002', at: '2026-11-02T00:00:00Z', requestId: 'REQ-1002' },
    { id: 'EVT-000003', at: '2026-11-03T00:00:00Z', requestId: 'REQ-1001' },
  ];
  assert.deepEqual(activityFor(log).map((e) => e.id), ['EVT-000003', 'EVT-000002', 'EVT-000001']);
  assert.deepEqual(activityFor(log, { requestId: 'REQ-1001' }).map((e) => e.id), ['EVT-000003', 'EVT-000001']);
  assert.equal(activityFor(log, { limit: 1 }).length, 1);
});
