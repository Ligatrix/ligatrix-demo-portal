// The handover bundle: everything a team needs to take the data elsewhere,
// in one JSON document that describes its own shape. `validateStore` checks a
// store or bundle for structural and workflow consistency before it is trusted.

import { SCHEMA_VERSION } from './store-core.mjs';
import { STATES, ACTIONS, isState, isAction } from './workflow.mjs';
import { REQUEST_TYPES, DEPARTMENTS, PRIORITIES } from './validation.mjs';
import { summarize } from './metrics.mjs';

export const BUNDLE_FORMAT = 'corvane-portal-handover';

export const REQUEST_FIELDS = Object.freeze({
  id: 'string, REQ-<number>, assigned on creation',
  title: 'string, 4 to 120 characters',
  type: `one of ${REQUEST_TYPES.join(', ')}`,
  department: `one of ${DEPARTMENTS.join(', ')}`,
  requester: 'string, the person asking',
  priority: `one of ${PRIORITIES.join(', ')}`,
  description: 'string, may be empty',
  amountCents: 'integer cents for purchases, otherwise null',
  vendor: 'string for purchases and supplier onboarding, otherwise null',
  system: 'string for access requests, otherwise null',
  neededBy: 'YYYY-MM-DD or null',
  state: `one of ${STATES.join(', ')}`,
  createdAt: 'ISO 8601 timestamp',
  updatedAt: 'ISO 8601 timestamp',
  reviewStartedAt: 'ISO 8601 timestamp or null',
  decision: '{ outcome, approver, comment, at } once approved or rejected, otherwise null',
});

export const LOG_FIELDS = Object.freeze({
  id: 'string, EVT-<number>',
  at: 'ISO 8601 timestamp',
  actor: 'string, who acted',
  requestId: 'the request acted on',
  action: `created, or one of ${Object.keys(ACTIONS).join(', ')}`,
  from: 'state before, null on creation',
  to: 'state after',
  comment: 'string, may be empty',
});

/** "corvane-handover-20261124T101500Z.json" */
export function handoverFilename(exportedAt) {
  const stamp = new Date(exportedAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `corvane-handover-${stamp}.json`;
}

export function buildHandover(store, { exportedAt }) {
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    throw new TypeError('exportedAt must be an ISO 8601 timestamp');
  }
  return {
    format: BUNDLE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    schema: {
      states: [...STATES],
      transitions: Object.fromEntries(Object.entries(ACTIONS).map(([name, rule]) => [name, { from: rule.from, to: rule.to }])),
      requestFields: REQUEST_FIELDS,
      logFields: LOG_FIELDS,
    },
    summary: summarize(store.requests, { now: exportedAt }),
    requests: store.requests.map((request) => ({ ...request })),
    log: store.log.map((entry) => ({ ...entry })),
  };
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * Check a store (or a handover bundle) is well formed: known schema version,
 * valid records, unique ids, log entries pointing at real requests, and each
 * request's state matching the last state its log recorded.
 *
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateStore(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return { ok: false, errors: ['Not a JSON object.'] };
  if (data.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion ${JSON.stringify(data.schemaVersion)} (expected ${SCHEMA_VERSION}).`);
  }
  if (!Array.isArray(data.requests)) errors.push('"requests" must be an array.');
  if (!Array.isArray(data.log)) errors.push('"log" must be an array.');
  if (errors.length > 0) return { ok: false, errors };

  const ids = new Set();
  for (const [index, request] of data.requests.entries()) {
    const where = `requests[${index}]`;
    if (!request || typeof request !== 'object') {
      errors.push(`${where} is not an object.`);
      continue;
    }
    if (!/^REQ-\d+$/.test(String(request.id))) errors.push(`${where} has an invalid id.`);
    else if (ids.has(request.id)) errors.push(`${where} repeats id ${request.id}.`);
    ids.add(request.id);
    if (!isState(request.state)) errors.push(`${where} has an unknown state.`);
    if (!REQUEST_TYPES.includes(request.type)) errors.push(`${where} has an unknown type.`);
    if (!isTimestamp(request.createdAt)) errors.push(`${where} has an invalid createdAt.`);
    if (request.amountCents !== null && request.amountCents !== undefined && !Number.isInteger(request.amountCents)) {
      errors.push(`${where} has a non-integer amountCents.`);
    }
  }

  const lastState = new Map();
  const eventIds = new Set();
  for (const [index, entry] of data.log.entries()) {
    const where = `log[${index}]`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${where} is not an object.`);
      continue;
    }
    if (eventIds.has(entry.id)) errors.push(`${where} repeats id ${entry.id}.`);
    eventIds.add(entry.id);
    if (!ids.has(entry.requestId)) errors.push(`${where} refers to unknown request ${entry.requestId}.`);
    if (entry.action !== 'created' && !isAction(entry.action)) errors.push(`${where} has an unknown action.`);
    if (!isTimestamp(entry.at)) errors.push(`${where} has an invalid timestamp.`);
    if (isState(entry.to)) lastState.set(entry.requestId, entry.to);
  }

  for (const request of data.requests) {
    if (!request || !ids.has(request.id)) continue;
    const logged = lastState.get(request.id);
    if (logged === undefined) errors.push(`${request.id} has no activity recorded.`);
    else if (logged !== request.state) {
      errors.push(`${request.id} is "${request.state}" but its log ends at "${logged}".`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Reduce a validated bundle (or store) to the stored shape. */
export function storeFromBundle(data) {
  const check = validateStore(data);
  if (!check.ok) {
    const error = new Error(`Invalid data: ${check.errors[0]}`);
    error.errors = check.errors;
    throw error;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    requests: data.requests.map((request) => ({ ...request })),
    log: data.log.map((entry) => ({ ...entry })),
  };
}
