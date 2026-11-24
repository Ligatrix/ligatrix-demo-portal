// The portal's data as a plain value, and the only two ways to change it.
//
//   store = { schemaVersion, requests: Request[], log: ActivityEntry[] }
//
// `createRequest` and `applyAction` are pure: they take a store and return a
// new one, along with what changed. The browser's in-memory store and the
// server's file store both call them, so the rules cannot drift apart.

import { DomainError, ERROR_CODES } from './errors.mjs';
import { validateRequestInput } from './validation.mjs';
import { transition } from './workflow.mjs';

export const SCHEMA_VERSION = 1;

export function emptyStore() {
  return { schemaVersion: SCHEMA_VERSION, requests: [], log: [] };
}

function numericSuffix(id) {
  const match = /-(\d+)$/.exec(String(id));
  return match ? Number(match[1]) : 0;
}

/** REQ-1001, REQ-1002, … continuing from the highest id already used. */
export function nextRequestId(requests) {
  const highest = requests.reduce((max, request) => Math.max(max, numericSuffix(request.id)), 1000);
  return `REQ-${highest + 1}`;
}

/** EVT-000001, EVT-000002, … continuing from the highest id already used. */
export function nextEventId(log) {
  const highest = log.reduce((max, entry) => Math.max(max, numericSuffix(entry.id)), 0);
  return `EVT-${String(highest + 1).padStart(6, '0')}`;
}

function requireTimestamp(now) {
  if (typeof now !== 'string' || Number.isNaN(Date.parse(now))) {
    throw new DomainError(ERROR_CODES.VALIDATION, 'A valid timestamp is required.', { fields: { now: 'Invalid.' } });
  }
}

export function findRequest(store, id) {
  return store.requests.find((request) => request.id === id) ?? null;
}

/**
 * Validate `input` and add it as a new request in state "new".
 * @returns {{store: object, request: object, entry: object}}
 */
export function createRequest(store, input, { now }) {
  requireTimestamp(now);
  const result = validateRequestInput(input, { today: now.slice(0, 10) });
  if (!result.ok) {
    throw new DomainError(ERROR_CODES.VALIDATION, 'Some fields need attention.', { fields: result.errors });
  }
  const request = {
    id: nextRequestId(store.requests),
    ...result.value,
    state: 'new',
    createdAt: now,
    updatedAt: now,
    reviewStartedAt: null,
    decision: null,
  };
  const entry = {
    id: nextEventId(store.log),
    at: now,
    actor: request.requester,
    requestId: request.id,
    action: 'created',
    from: null,
    to: 'new',
    comment: '',
  };
  return {
    store: { ...store, requests: [...store.requests, request], log: [...store.log, entry] },
    request,
    entry,
  };
}

/**
 * Move request `id` through the workflow with `action`.
 * @returns {{store: object, request: object, entry: object}}
 */
export function applyAction(store, id, action, { actor, comment, now }) {
  requireTimestamp(now);
  const current = findRequest(store, id);
  if (!current) throw new DomainError(ERROR_CODES.NOT_FOUND, `Request ${id} was not found.`, { id });
  const { request, entry: partial } = transition(current, action, { actor, comment, at: now });
  const entry = { id: nextEventId(store.log), ...partial };
  return {
    store: {
      ...store,
      requests: store.requests.map((item) => (item.id === id ? request : item)),
      log: [...store.log, entry],
    },
    request,
    entry,
  };
}
