import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countByState, averageTimeToApprovalMs, approvalRate, agingOpenRequests, approvedSpendCents, summarize } from '../src/domain/metrics.mjs';
import { requestRecord } from '../test-support/fixtures.mjs';

const approved = (id, createdAt, decidedAt, amountCents = 100) =>
  requestRecord({ id, state: 'approved', createdAt, amountCents, decision: { outcome: 'approved', approver: 'Dana', comment: '', at: decidedAt } });

test('countByState includes every state, even with no requests', () => {
  assert.deepEqual(countByState([]), { new: 0, in_review: 0, approved: 0, rejected: 0, done: 0 });
  assert.deepEqual(countByState([requestRecord(), requestRecord({ state: 'done' }), requestRecord({ state: 'bogus' })]), {
    new: 1, in_review: 0, approved: 0, rejected: 0, done: 1,
  });
});

test('average time to approval is the mean of approved requests only', () => {
  const requests = [
    approved('REQ-1', '2026-11-01T00:00:00Z', '2026-11-01T02:00:00Z'),
    approved('REQ-2', '2026-11-01T00:00:00Z', '2026-11-01T04:00:00Z'),
    requestRecord({ state: 'rejected', decision: { outcome: 'rejected', approver: 'Dana', comment: 'no', at: '2026-12-01T00:00:00Z' } }),
  ];
  assert.equal(averageTimeToApprovalMs(requests), 3 * 3_600_000);
});

test('average time to approval is null with nothing approved, and ignores impossible durations', () => {
  assert.equal(averageTimeToApprovalMs([requestRecord()]), null);
  assert.equal(averageTimeToApprovalMs([approved('REQ-1', '2026-11-02T00:00:00Z', '2026-11-01T00:00:00Z')]), null);
});

test('approval rate counts approved over decided, including requests since marked done', () => {
  const done = approved('REQ-3', '2026-11-01T00:00:00Z', '2026-11-01T01:00:00Z');
  done.state = 'done';
  const rejected = requestRecord({ state: 'rejected', decision: { outcome: 'rejected', approver: 'Dana', comment: 'no', at: '2026-11-02T00:00:00Z' } });
  assert.equal(approvalRate([done, rejected, requestRecord()]), 0.5);
  assert.equal(approvalRate([requestRecord()]), null);
});

test('aging open requests are open and older than the threshold, oldest first', () => {
  const requests = [
    requestRecord({ id: 'REQ-A', createdAt: '2026-11-10T00:00:00Z' }),
    requestRecord({ id: 'REQ-B', createdAt: '2026-11-05T00:00:00Z', state: 'in_review' }),
    requestRecord({ id: 'REQ-C', createdAt: '2026-11-23T00:00:00Z' }),
    requestRecord({ id: 'REQ-D', createdAt: '2026-11-01T00:00:00Z', state: 'done' }),
  ];
  const aging = agingOpenRequests(requests, { now: '2026-11-24T00:00:00Z' });
  assert.deepEqual(aging.map((request) => request.id), ['REQ-B', 'REQ-A']);
});

test('approved spend sums only approved purchases', () => {
  const requests = [
    approved('REQ-1', '2026-11-01T00:00:00Z', '2026-11-01T01:00:00Z', 50000),
    approved('REQ-2', '2026-11-01T00:00:00Z', '2026-11-01T01:00:00Z', null),
    requestRecord({ amountCents: 99999 }),
  ];
  assert.equal(approvedSpendCents(requests), 50000);
});

test('summarize returns the dashboard figures together', () => {
  const summary = summarize([requestRecord(), requestRecord({ state: 'in_review' }), requestRecord({ state: 'done' })], { now: '2026-11-21T00:00:00Z' });
  assert.equal(summary.total, 3);
  assert.equal(summary.open, 2);
  assert.equal(summary.averageTimeToApprovalMs, null);
  assert.deepEqual(summary.agingOpen, []);
});
