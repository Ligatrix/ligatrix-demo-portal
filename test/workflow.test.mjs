import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, STATES, availableActions, canTransition, transition } from '../src/domain/workflow.mjs';
import { DomainError } from '../src/domain/errors.mjs';
import { requestRecord } from '../test-support/fixtures.mjs';

const AT = '2026-11-21T10:00:00.000Z';

test('every action moves between known states', () => {
  for (const rule of Object.values(ACTIONS)) {
    assert.ok(STATES.includes(rule.from));
    assert.ok(STATES.includes(rule.to));
  }
});

test('availableActions lists the moves out of each state', () => {
  assert.deepEqual(availableActions('new'), ['start_review']);
  assert.deepEqual(availableActions('in_review'), ['approve', 'reject']);
  assert.deepEqual(availableActions('approved'), ['complete']);
  assert.deepEqual(availableActions('rejected'), ['close']);
  assert.deepEqual(availableActions('done'), []);
  assert.deepEqual(availableActions('nonsense'), []);
});

test('canTransition rejects unknown actions and wrong source states', () => {
  assert.equal(canTransition('new', 'start_review'), true);
  assert.equal(canTransition('new', 'approve'), false);
  assert.equal(canTransition('in_review', 'toString'), false);
  assert.equal(canTransition('done', 'close'), false);
});

test('start_review moves new to in_review and records when', () => {
  const { request, entry } = transition(requestRecord(), 'start_review', { actor: 'Dana', at: AT });
  assert.equal(request.state, 'in_review');
  assert.equal(request.reviewStartedAt, AT);
  assert.equal(request.updatedAt, AT);
  assert.deepEqual(entry, { at: AT, actor: 'Dana', requestId: 'REQ-1001', action: 'start_review', from: 'new', to: 'in_review', comment: '' });
});

test('approve records the approver, comment and time on the decision', () => {
  const { request } = transition(requestRecord({ state: 'in_review' }), 'approve', {
    actor: ' Dana ',
    comment: ' Within budget. ',
    at: AT,
  });
  assert.equal(request.state, 'approved');
  assert.deepEqual(request.decision, { outcome: 'approved', approver: 'Dana', comment: 'Within budget.', at: AT });
});

test('approve allows an empty comment', () => {
  const { request } = transition(requestRecord({ state: 'in_review' }), 'approve', { actor: 'Dana', at: AT });
  assert.equal(request.decision.comment, '');
});

test('reject requires a comment', () => {
  assert.throws(
    () => transition(requestRecord({ state: 'in_review' }), 'reject', { actor: 'Dana', comment: '   ', at: AT }),
    (error) => error instanceof DomainError && error.code === 'validation_failed' && 'comment' in error.details.fields,
  );
});

test('reject with a comment moves to rejected', () => {
  const { request } = transition(requestRecord({ state: 'in_review' }), 'reject', {
    actor: 'Marco',
    comment: 'Needs a second quote.',
    at: AT,
  });
  assert.equal(request.state, 'rejected');
  assert.equal(request.decision.outcome, 'rejected');
});

test('the requester cannot approve or reject their own request, in any letter case', () => {
  for (const action of ['approve', 'reject']) {
    assert.throws(
      () => transition(requestRecord({ state: 'in_review' }), action, { actor: 'leo', comment: 'x', at: AT }),
      (error) => error.code === 'forbidden',
    );
  }
});

test('the requester may still start the review and mark their request done', () => {
  assert.equal(transition(requestRecord(), 'start_review', { actor: 'Leo', at: AT }).request.state, 'in_review');
  assert.equal(transition(requestRecord({ state: 'approved' }), 'complete', { actor: 'Leo', at: AT }).request.state, 'done');
});

test('a move from the wrong state is refused with the allowed actions', () => {
  assert.throws(
    () => transition(requestRecord({ state: 'new' }), 'approve', { actor: 'Dana', at: AT }),
    (error) => error.code === 'invalid_transition' && error.details.allowed[0] === 'start_review',
  );
});

test('done is terminal', () => {
  for (const action of Object.keys(ACTIONS)) {
    assert.throws(() => transition(requestRecord({ state: 'done' }), action, { actor: 'Dana', comment: 'x', at: AT }));
  }
});

test('unknown actions, missing actor and bad timestamps are refused', () => {
  assert.throws(() => transition(requestRecord(), 'escalate', { actor: 'Dana', at: AT }), /Unknown action/);
  assert.throws(() => transition(requestRecord(), 'start_review', { actor: '  ', at: AT }), /actor/);
  assert.throws(() => transition(requestRecord(), 'start_review', { actor: 'Dana', at: 'yesterday' }), /timestamp/);
  assert.throws(() => transition(null, 'start_review', { actor: 'Dana', at: AT }), /not found/);
});

test('an over-long comment is refused', () => {
  assert.throws(
    () => transition(requestRecord({ state: 'in_review' }), 'approve', { actor: 'Dana', comment: 'x'.repeat(1001), at: AT }),
    /1000 characters/,
  );
});

test('transition never mutates the input request', () => {
  const original = requestRecord();
  const frozen = structuredClone(original);
  transition(original, 'start_review', { actor: 'Dana', at: AT });
  assert.deepEqual(original, frozen);
});
