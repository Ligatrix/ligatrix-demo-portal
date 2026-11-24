// This file is written by scripts/bundle.mjs from the modules in src/. Do not edit it by hand:
// change the modules and run `npm run bundle`. It is only used when index.html is opened from disk.
(() => {
'use strict';
const modules = {};
modules["src/ui/dom.mjs"] = (() => {
// Tiny DOM helpers. Text is always set through text nodes, never parsed as
// HTML, so user input cannot inject markup.

const SVG_NS = 'http://www.w3.org/2000/svg';

function setProps(element, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') element.setAttribute('class', value);
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' && 'value' in element) element.value = value;
    else if (key === 'checked' && 'checked' in element) element.checked = Boolean(value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
}

function appendChildren(element, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** h('a', { href: '#/x', class: 'link' }, 'Text', otherNode) */
function h(tag, props, ...children) {
  const element = document.createElement(tag);
  setProps(element, props);
  appendChildren(element, children);
  return element;
}

/** Same as h, for SVG elements. */
function s(tag, props, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  setProps(element, props);
  appendChildren(element, children);
  return element;
}

function clear(element) {
  while (element.firstChild) element.firstChild.remove();
  return element;
}
return { h, s, clear };
})();

modules["src/ui/chart.mjs"] = (() => {
  const { h, s } = modules["src/ui/dom.mjs"];
// A single-series bar chart drawn as SVG by code: requests per workflow state.
// One accent hue (identity is carried by the axis labels, not colour), value
// labels above each bar, a focusable column per bar with a native tooltip,
// and a visually hidden table for screen readers.



const WIDTH = 520;
const HEIGHT = 240;
const PAD = { top: 28, right: 8, bottom: 34, left: 8 };

/** "nice" upper bound for the axis: 1, 2, 5, 10, 20, 50 … at or above max. */
function niceMax(max) {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) {
    if (step * magnitude >= max) return step * magnitude;
  }
  return 10 * magnitude;
}

/** Path for a bar with 4px rounded top corners and a square base. */
function barPath(x, y, width, height) {
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/**
 * @param {{label: string, value: number}[]} data
 * @param {{title: string}} options
 */
function barChart(data, { title }) {
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = innerWidth / data.length;
  const barWidth = Math.min(56, slot * 0.56);
  const baseline = PAD.top + innerHeight;

  const gridLines = [0.5, 1].map((fraction) => {
    const y = baseline - innerHeight * fraction;
    return s('line', { class: 'grid', x1: PAD.left, x2: WIDTH - PAD.right, y1: y, y2: y });
  });

  const columns = data.map((datum, index) => {
    const height = top === 0 ? 0 : (datum.value / top) * innerHeight;
    const centre = PAD.left + slot * index + slot / 2;
    const x = centre - barWidth / 2;
    const y = baseline - height;
    const description = `${datum.label}: ${datum.value}`;
    return s(
      'g',
      { class: 'col', tabindex: 0, role: 'img', 'aria-label': description },
      s('title', null, description),
      s('rect', { class: 'hit', x: centre - slot / 2 + 2, y: PAD.top - 20, width: slot - 4, height: innerHeight + 20, rx: 4 }),
      height > 0 ? s('path', { class: 'bar', d: barPath(x, y, barWidth, height) }) : null,
      s('text', { class: 'value', x: centre, y: y - 8, 'text-anchor': 'middle' }, String(datum.value)),
      s('text', { class: 'label', x: centre, y: baseline + 20, 'text-anchor': 'middle' }, datum.label),
    );
  });

  const svg = s(
    'svg',
    { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, 'aria-hidden': 'false', role: 'group', 'aria-label': title },
    gridLines,
    columns,
    s('line', { class: 'baseline', x1: PAD.left, x2: WIDTH - PAD.right, y1: baseline, y2: baseline }),
  );

  const table = h(
    'table',
    { class: 'sr-only' },
    h('caption', null, title),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'State'), h('th', { scope: 'col' }, 'Requests'))),
    h('tbody', null, data.map((d) => h('tr', null, h('th', { scope: 'row' }, d.label), h('td', null, String(d.value))))),
  );

  return h('div', { class: 'chart' }, svg, table);
}
return { niceMax, barChart };
})();

modules["src/domain/errors.mjs"] = (() => {
// A single error type for every rule the domain enforces. `code` is stable and
// machine-readable; the server maps it to an HTTP status, the UI to a message.

const ERROR_CODES = Object.freeze({
  VALIDATION: 'validation_failed',
  NOT_FOUND: 'not_found',
  INVALID_TRANSITION: 'invalid_transition',
  FORBIDDEN: 'forbidden',
  BAD_BUNDLE: 'bad_bundle',
});

class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

function isDomainError(value) {
  return value instanceof DomainError || (value !== null && typeof value === 'object' && value.name === 'DomainError');
}
return { ERROR_CODES, DomainError, isDomainError };
})();

modules["src/domain/validation.mjs"] = (() => {
// Intake validation. `validateRequestInput` takes raw form or JSON input and
// returns either a normalised value ready to store or a map of field errors
// written for the person filling in the form.

const REQUEST_TYPES = Object.freeze(['purchase', 'supplier_onboarding', 'access']);

const TYPE_LABELS = Object.freeze({
  purchase: 'Purchase approval',
  supplier_onboarding: 'Supplier onboarding',
  access: 'Access request',
});

const DEPARTMENTS = Object.freeze(['Operations', 'Finance', 'Warehouse', 'Procurement', 'Sales', 'IT']);

const PRIORITIES = Object.freeze(['low', 'normal', 'high']);

const LIMITS = Object.freeze({
  titleMin: 4,
  titleMax: 120,
  nameMin: 2,
  nameMax: 60,
  vendorMax: 80,
  systemMax: 60,
  descriptionMax: 2000,
  amountMax: 1_000_000,
});

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function text(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function multiline(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\r\n?/g, '\n').trim();
}

/**
 * Parse a money amount into integer cents. Accepts numbers and strings such
 * as "1250", "1,250.5" or "$1,250.50". Returns null when it cannot be parsed
 * or has more than two decimal places.
 */
function parseAmountToCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    value = String(value);
  }
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** True when `value` is a real calendar date written as YYYY-MM-DD. */
function isIsoDate(value) {
  const match = typeof value === 'string' ? DATE_RE.exec(value) : null;
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function checkLength(errors, field, value, min, max, label) {
  if (!value) errors[field] = `${label} is required.`;
  else if (value.length < min) errors[field] = `${label} must be at least ${min} characters.`;
  else if (value.length > max) errors[field] = `${label} must be ${max} characters or fewer.`;
}

/**
 * @param {object} input raw fields
 * @param {{today?: string}} [options] today's date (YYYY-MM-DD) for the needed-by check
 * @returns {{ok: true, value: object} | {ok: false, errors: Record<string, string>}}
 */
function validateRequestInput(input, options = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const errors = {};

  const title = text(raw.title);
  checkLength(errors, 'title', title, LIMITS.titleMin, LIMITS.titleMax, 'Title');

  const type = text(raw.type);
  if (!REQUEST_TYPES.includes(type)) errors.type = 'Choose a request type.';

  const department = text(raw.department);
  if (!DEPARTMENTS.includes(department)) errors.department = 'Choose a department.';

  const requester = text(raw.requester);
  checkLength(errors, 'requester', requester, LIMITS.nameMin, LIMITS.nameMax, 'Requester');

  const priority = text(raw.priority) || 'normal';
  if (!PRIORITIES.includes(priority)) errors.priority = 'Priority must be low, normal or high.';

  const description = multiline(raw.description);
  if (description.length > LIMITS.descriptionMax) {
    errors.description = `Description must be ${LIMITS.descriptionMax} characters or fewer.`;
  }

  let amountCents = null;
  let vendor = null;
  let system = null;

  if (type === 'purchase') {
    const rawAmount = raw.amount ?? '';
    if (text(rawAmount) === '') {
      errors.amount = 'Amount is required for a purchase.';
    } else {
      amountCents = parseAmountToCents(rawAmount);
      if (amountCents === null) errors.amount = 'Enter an amount such as 1250 or 1,250.50.';
      else if (amountCents <= 0) errors.amount = 'Amount must be greater than zero.';
      else if (amountCents > LIMITS.amountMax * 100) {
        errors.amount = `Amount must be ${LIMITS.amountMax.toLocaleString('en-US')} or less.`;
      }
    }
  }

  if (type === 'purchase' || type === 'supplier_onboarding') {
    vendor = text(raw.vendor);
    checkLength(errors, 'vendor', vendor, LIMITS.nameMin, LIMITS.vendorMax, 'Supplier');
  }

  if (type === 'access') {
    system = text(raw.system);
    checkLength(errors, 'system', system, LIMITS.nameMin, LIMITS.systemMax, 'System');
  }

  const neededBy = text(raw.neededBy) || null;
  if (neededBy !== null) {
    if (!isIsoDate(neededBy)) errors.neededBy = 'Use a date in the form YYYY-MM-DD.';
    else if (options.today && isIsoDate(options.today) && neededBy < options.today) {
      errors.neededBy = 'Needed-by date cannot be in the past.';
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { title, type, department, requester, priority, description, amountCents, vendor, system, neededBy },
  };
}
return { REQUEST_TYPES, TYPE_LABELS, DEPARTMENTS, PRIORITIES, LIMITS, parseAmountToCents, isIsoDate, validateRequestInput };
})();

modules["src/domain/workflow.mjs"] = (() => {
  const { DomainError, ERROR_CODES } = modules["src/domain/errors.mjs"];
// The request lifecycle as an explicit state machine.
//
//   new ──start_review──▶ in_review ──approve──▶ approved ──complete──▶ done
//                              │
//                              └────reject───▶ rejected ──close──▶ done
//
// Every change of state goes through `transition`, which checks the move is
// allowed, enforces the guard for that action and returns a new request plus
// the activity entry describing it. Nothing here mutates its inputs.



const STATES = Object.freeze(['new', 'in_review', 'approved', 'rejected', 'done']);

const STATE_LABELS = Object.freeze({
  new: 'New',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  done: 'Done',
});

const ACTIONS = Object.freeze({
  start_review: Object.freeze({ from: 'new', to: 'in_review', label: 'Start review' }),
  approve: Object.freeze({ from: 'in_review', to: 'approved', label: 'Approve' }),
  reject: Object.freeze({ from: 'in_review', to: 'rejected', label: 'Reject' }),
  complete: Object.freeze({ from: 'approved', to: 'done', label: 'Mark done' }),
  close: Object.freeze({ from: 'rejected', to: 'done', label: 'Close' }),
});

const TERMINAL_STATES = Object.freeze(['done']);
const OPEN_STATES = Object.freeze(['new', 'in_review']);

const COMMENT_MAX = 1000;

function isState(value) {
  return STATES.includes(value);
}

function isAction(value) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, value);
}

/** Actions that may be taken from a state, in a stable order. */
function availableActions(state) {
  return Object.keys(ACTIONS).filter((name) => ACTIONS[name].from === state);
}

function canTransition(state, action) {
  return isAction(action) && ACTIONS[action].from === state;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Apply `action` to `request`.
 *
 * @param {object} request  the current request record
 * @param {string} action   one of the keys of ACTIONS
 * @param {{actor: string, comment?: string, at: string}} context
 * @returns {{request: object, entry: object}} the updated request and an activity entry (without id)
 */
function transition(request, action, context) {
  if (!request || typeof request !== 'object') {
    throw new DomainError(ERROR_CODES.NOT_FOUND, 'Request not found.');
  }
  if (!isAction(action)) {
    throw new DomainError(ERROR_CODES.INVALID_TRANSITION, `Unknown action "${action}".`, { action });
  }
  const rule = ACTIONS[action];
  if (request.state !== rule.from) {
    throw new DomainError(
      ERROR_CODES.INVALID_TRANSITION,
      `Cannot ${rule.label.toLowerCase()} a request that is ${STATE_LABELS[request.state] ?? request.state}.`,
      { action, from: request.state, allowed: availableActions(request.state) },
    );
  }

  const actor = cleanText(context?.actor);
  const comment = cleanText(context?.comment);
  const at = context?.at;
  if (!actor) {
    throw new DomainError(ERROR_CODES.VALIDATION, 'An actor is required.', { fields: { actor: 'Required.' } });
  }
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
    throw new DomainError(ERROR_CODES.VALIDATION, 'A valid timestamp is required.', { fields: { at: 'Invalid.' } });
  }
  if (comment.length > COMMENT_MAX) {
    throw new DomainError(ERROR_CODES.VALIDATION, `Comment must be ${COMMENT_MAX} characters or fewer.`, {
      fields: { comment: 'Too long.' },
    });
  }

  // Guards specific to decisions.
  if (action === 'approve' || action === 'reject') {
    if (actor.toLowerCase() === cleanText(request.requester).toLowerCase()) {
      throw new DomainError(ERROR_CODES.FORBIDDEN, 'The requester cannot decide on their own request.', {
        fields: { actor: 'Choose a different approver.' },
      });
    }
  }
  if (action === 'reject' && !comment) {
    throw new DomainError(ERROR_CODES.VALIDATION, 'A rejection needs a comment explaining why.', {
      fields: { comment: 'Required when rejecting.' },
    });
  }

  const next = { ...request, state: rule.to, updatedAt: at };
  if (action === 'approve' || action === 'reject') {
    next.decision = {
      outcome: action === 'approve' ? 'approved' : 'rejected',
      approver: actor,
      comment,
      at,
    };
  }
  if (action === 'start_review') {
    next.reviewStartedAt = at;
  }

  const entry = {
    at,
    actor,
    requestId: request.id,
    action,
    from: rule.from,
    to: rule.to,
    comment,
  };
  return { request: next, entry };
}
return { STATES, STATE_LABELS, ACTIONS, TERMINAL_STATES, OPEN_STATES, COMMENT_MAX, isState, isAction, availableActions, canTransition, transition };
})();

modules["src/domain/store-core.mjs"] = (() => {
  const { DomainError, ERROR_CODES } = modules["src/domain/errors.mjs"];
  const { validateRequestInput } = modules["src/domain/validation.mjs"];
  const { transition } = modules["src/domain/workflow.mjs"];
// The portal's data as a plain value, and the only two ways to change it.
//
//   store = { schemaVersion, requests: Request[], log: ActivityEntry[] }
//
// `createRequest` and `applyAction` are pure: they take a store and return a
// new one, along with what changed. The browser's in-memory store and the
// server's file store both call them, so the rules cannot drift apart.





const SCHEMA_VERSION = 1;

function emptyStore() {
  return { schemaVersion: SCHEMA_VERSION, requests: [], log: [] };
}

function numericSuffix(id) {
  const match = /-(\d+)$/.exec(String(id));
  return match ? Number(match[1]) : 0;
}

/** REQ-1001, REQ-1002, … continuing from the highest id already used. */
function nextRequestId(requests) {
  const highest = requests.reduce((max, request) => Math.max(max, numericSuffix(request.id)), 1000);
  return `REQ-${highest + 1}`;
}

/** EVT-000001, EVT-000002, … continuing from the highest id already used. */
function nextEventId(log) {
  const highest = log.reduce((max, entry) => Math.max(max, numericSuffix(entry.id)), 0);
  return `EVT-${String(highest + 1).padStart(6, '0')}`;
}

function requireTimestamp(now) {
  if (typeof now !== 'string' || Number.isNaN(Date.parse(now))) {
    throw new DomainError(ERROR_CODES.VALIDATION, 'A valid timestamp is required.', { fields: { now: 'Invalid.' } });
  }
}

function findRequest(store, id) {
  return store.requests.find((request) => request.id === id) ?? null;
}

/**
 * Validate `input` and add it as a new request in state "new".
 * @returns {{store: object, request: object, entry: object}}
 */
function createRequest(store, input, { now }) {
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
function applyAction(store, id, action, { actor, comment, now }) {
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
return { SCHEMA_VERSION, emptyStore, nextRequestId, nextEventId, findRequest, createRequest, applyAction };
})();

modules["src/domain/metrics.mjs"] = (() => {
  const { STATES, OPEN_STATES } = modules["src/domain/workflow.mjs"];
// Dashboard figures, computed from the requests alone.



const HOUR = 3_600_000;

function countByState(requests) {
  const counts = Object.fromEntries(STATES.map((state) => [state, 0]));
  for (const request of requests) {
    if (Object.prototype.hasOwnProperty.call(counts, request.state)) counts[request.state] += 1;
  }
  return counts;
}

/** Milliseconds from submission to approval for every approved request. */
function approvalDurations(requests) {
  const durations = [];
  for (const request of requests) {
    if (request.decision?.outcome !== 'approved') continue;
    const ms = Date.parse(request.decision.at) - Date.parse(request.createdAt);
    if (Number.isFinite(ms) && ms >= 0) durations.push(ms);
  }
  return durations;
}

/** Mean time to approval in milliseconds, or null when nothing is approved yet. */
function averageTimeToApprovalMs(requests) {
  const durations = approvalDurations(requests);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length);
}

/** Share of decided requests that were approved (0..1), or null when none are decided. */
function approvalRate(requests) {
  let approved = 0;
  let decided = 0;
  for (const request of requests) {
    if (!request.decision) continue;
    decided += 1;
    if (request.decision.outcome === 'approved') approved += 1;
  }
  return decided === 0 ? null : approved / decided;
}

/** Open requests (new or in review) older than `thresholdHours`, oldest first. */
function agingOpenRequests(requests, { now, thresholdHours = 72 }) {
  const cutoff = Date.parse(now) - thresholdHours * HOUR;
  return requests
    .filter((request) => OPEN_STATES.includes(request.state) && Date.parse(request.createdAt) <= cutoff)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Total value of approved purchases, in cents, including those since marked done. */
function approvedSpendCents(requests) {
  return requests
    .filter((request) => request.decision?.outcome === 'approved' && Number.isInteger(request.amountCents))
    .reduce((sum, request) => sum + request.amountCents, 0);
}

function summarize(requests, { now }) {
  const byState = countByState(requests);
  return {
    total: requests.length,
    open: OPEN_STATES.reduce((sum, state) => sum + byState[state], 0),
    byState,
    averageTimeToApprovalMs: averageTimeToApprovalMs(requests),
    approvalRate: approvalRate(requests),
    approvedSpendCents: approvedSpendCents(requests),
    agingOpen: agingOpenRequests(requests, { now }).map((request) => request.id),
  };
}
return { countByState, approvalDurations, averageTimeToApprovalMs, approvalRate, agingOpenRequests, approvedSpendCents, summarize };
})();

modules["src/domain/export.mjs"] = (() => {
  const { SCHEMA_VERSION } = modules["src/domain/store-core.mjs"];
  const { STATES, ACTIONS, isState, isAction } = modules["src/domain/workflow.mjs"];
  const { REQUEST_TYPES, DEPARTMENTS, PRIORITIES } = modules["src/domain/validation.mjs"];
  const { summarize } = modules["src/domain/metrics.mjs"];
// The handover bundle: everything a team needs to take the data elsewhere,
// in one JSON document that describes its own shape. `validateStore` checks a
// store or bundle for structural and workflow consistency before it is trusted.






const BUNDLE_FORMAT = 'corvane-portal-handover';

const REQUEST_FIELDS = Object.freeze({
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

const LOG_FIELDS = Object.freeze({
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
function handoverFilename(exportedAt) {
  const stamp = new Date(exportedAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `corvane-handover-${stamp}.json`;
}

function buildHandover(store, { exportedAt }) {
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
function validateStore(data) {
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
function storeFromBundle(data) {
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
return { BUNDLE_FORMAT, REQUEST_FIELDS, LOG_FIELDS, handoverFilename, buildHandover, validateStore, storeFromBundle };
})();

modules["src/domain/seed.mjs"] = (() => {
  const { createRequest, applyAction, emptyStore } = modules["src/domain/store-core.mjs"];
// Demo data for Corvane Supply Co., a fictional distributor used in this demo.
// Every supplier, system and first name below is invented.
//
// The seed is not a static snapshot: it is a timeline of intake and workflow
// steps replayed through the same functions the portal uses, so the seeded
// requests, decisions and activity log are always consistent with the rules.



const DEMO_COMPANY = 'Corvane Supply Co., a fictional distributor used in this demo';

const DEMO_PEOPLE = Object.freeze(['Dana', 'Marco', 'Ines', 'Leo', 'Maya', 'Sam', 'Nora', 'Owen']);

const DEMO_APPROVERS = Object.freeze(['Dana', 'Marco', 'Ines']);

const REQUESTS = [
  {
    at: '2026-11-02T14:10:00Z',
    input: {
      title: 'Replacement pallet jacks for dock 3',
      type: 'purchase', department: 'Warehouse', requester: 'Leo', priority: 'high',
      amount: '4,860.00', vendor: 'Ostrander Pallet Co.', neededBy: '2026-11-14',
      description: 'Two of the four manual jacks on dock 3 failed inspection. Quote attached to the ticket covers four units with a two-year warranty.',
    },
    steps: [
      { at: '2026-11-02T16:40:00Z', action: 'start_review', actor: 'Dana' },
      { at: '2026-11-03T09:15:00Z', action: 'approve', actor: 'Dana', comment: 'Within the dock maintenance budget. Approved.' },
      { at: '2026-11-07T11:00:00Z', action: 'complete', actor: 'Leo', comment: 'Delivered and in service.' },
    ],
  },
  {
    at: '2026-11-03T10:05:00Z',
    input: {
      title: 'Onboard Quarrow Packaging as corrugated supplier',
      type: 'supplier_onboarding', department: 'Procurement', requester: 'Maya', priority: 'normal',
      vendor: 'Quarrow Packaging',
      description: 'Second source for double-wall cartons. W-9, insurance certificate and bank details received.',
    },
    steps: [
      { at: '2026-11-04T08:30:00Z', action: 'start_review', actor: 'Ines' },
      { at: '2026-11-06T15:20:00Z', action: 'approve', actor: 'Ines', comment: 'Documents verified. Net 30 terms agreed.' },
      { at: '2026-11-10T09:00:00Z', action: 'complete', actor: 'Maya', comment: 'Supplier record created in the ledger.' },
    ],
  },
  {
    at: '2026-11-05T13:45:00Z',
    input: {
      title: 'Read access to accounts payable ledger',
      type: 'access', department: 'Finance', requester: 'Sam', priority: 'normal',
      system: 'Accounts payable ledger',
      description: 'Needed for month-end accrual checks. Read only.',
    },
    steps: [
      { at: '2026-11-05T15:00:00Z', action: 'start_review', actor: 'Marco' },
      { at: '2026-11-05T17:30:00Z', action: 'approve', actor: 'Marco', comment: 'Read-only role granted until year end.' },
    ],
  },
  {
    at: '2026-11-06T09:20:00Z',
    input: {
      title: 'Annual forklift service contract',
      type: 'purchase', department: 'Operations', requester: 'Owen', priority: 'normal',
      amount: '18,400', vendor: 'Fenwick Lift Service', neededBy: '2026-12-01',
      description: 'Renewal covering six forklifts: quarterly service, parts at cost, 24-hour callout.',
    },
    steps: [
      { at: '2026-11-07T10:00:00Z', action: 'start_review', actor: 'Dana' },
      { at: '2026-11-11T14:45:00Z', action: 'reject', actor: 'Dana', comment: 'Price is 22% above last year. Please get a second quote before resubmitting.' },
      { at: '2026-11-12T08:10:00Z', action: 'close', actor: 'Owen', comment: 'Closing; a new request will follow with two quotes.' },
    ],
  },
  {
    at: '2026-11-09T11:30:00Z',
    input: {
      title: 'Cold storage overflow space for December',
      type: 'purchase', department: 'Operations', requester: 'Nora', priority: 'high',
      amount: '7,250.00', vendor: 'Brisa Cold Chain', neededBy: '2026-11-30',
      description: 'Rent 40 pallet positions for four weeks to cover the seasonal peak.',
    },
    steps: [
      { at: '2026-11-09T13:00:00Z', action: 'start_review', actor: 'Marco' },
      { at: '2026-11-10T10:30:00Z', action: 'approve', actor: 'Marco', comment: 'Approved. Charge to the Q4 peak budget line.' },
    ],
  },
  {
    at: '2026-11-12T08:45:00Z',
    input: {
      title: 'Admin access to shipping label portal',
      type: 'access', department: 'Warehouse', requester: 'Leo', priority: 'low',
      system: 'Shipping label portal',
      description: 'Admin role requested to manage carrier accounts.',
    },
    steps: [
      { at: '2026-11-12T10:00:00Z', action: 'start_review', actor: 'Ines' },
      { at: '2026-11-13T09:40:00Z', action: 'reject', actor: 'Ines', comment: 'Admin is limited to two people. Operator role covers carrier selection.' },
    ],
  },
  {
    at: '2026-11-14T15:00:00Z',
    input: {
      title: 'Onboard Halvern Freight Lines for regional LTL',
      type: 'supplier_onboarding', department: 'Operations', requester: 'Owen', priority: 'high',
      vendor: 'Halvern Freight Lines',
      description: 'Regional part-load carrier for the northern routes. Rate sheet and insurance received; safety record pending.',
    },
    steps: [
      { at: '2026-11-16T09:10:00Z', action: 'start_review', actor: 'Dana' },
    ],
  },
  {
    at: '2026-11-17T10:25:00Z',
    input: {
      title: 'Label printers for packing stations',
      type: 'purchase', department: 'Warehouse', requester: 'Nora', priority: 'normal',
      amount: '2,316.40', vendor: 'Tallowmere Office Supply', neededBy: '2026-12-05',
      description: 'Three thermal label printers to replace units at stations 4 to 6.',
    },
    steps: [
      { at: '2026-11-18T08:00:00Z', action: 'start_review', actor: 'Marco' },
    ],
  },
  {
    at: '2026-11-19T13:05:00Z',
    input: {
      title: 'Inventory reports access for new planner',
      type: 'access', department: 'Sales', requester: 'Maya', priority: 'normal',
      system: 'Inventory reports',
      description: 'New demand planner starts on Monday and needs the weekly stock reports.',
    },
    steps: [
      { at: '2026-11-19T14:30:00Z', action: 'start_review', actor: 'Ines' },
      { at: '2026-11-20T09:05:00Z', action: 'approve', actor: 'Ines', comment: 'Reports viewer role assigned.' },
      { at: '2026-11-20T09:30:00Z', action: 'complete', actor: 'Maya', comment: 'Confirmed working.' },
    ],
  },
  {
    at: '2026-11-21T09:40:00Z',
    input: {
      title: 'Stretch wrap restock, Q1 supply',
      type: 'purchase', department: 'Procurement', requester: 'Sam', priority: 'low',
      amount: '1,180.00', vendor: 'Quarrow Packaging', neededBy: '2026-12-15',
      description: 'Sixty rolls of 18-inch stretch wrap at the contract price.',
    },
    steps: [],
  },
  {
    at: '2026-11-22T16:15:00Z',
    input: {
      title: 'Onboard Ostrander Pallet Co. for pallet repair',
      type: 'supplier_onboarding', department: 'Procurement', requester: 'Maya', priority: 'normal',
      vendor: 'Ostrander Pallet Co.',
      description: 'Extend the existing supplier record to cover pallet repair and collection.',
    },
    steps: [],
  },
  {
    at: '2026-11-23T08:50:00Z',
    input: {
      title: 'Warehouse management system access for seasonal leads',
      type: 'access', department: 'Warehouse', requester: 'Leo', priority: 'high',
      system: 'Warehouse management system',
      description: 'Four seasonal shift leads need pick-list access from December 1.',
      neededBy: '2026-12-01',
    },
    steps: [],
  },
];

/** Build the seeded store by replaying the demo timeline in time order. */
function buildSeedStore() {
  const timeline = [];
  REQUESTS.forEach((item, index) => {
    timeline.push({ at: item.at, kind: 'create', index });
    for (const step of item.steps) timeline.push({ ...step, kind: 'step', index });
  });
  timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  let store = emptyStore();
  const ids = [];
  for (const event of timeline) {
    if (event.kind === 'create') {
      const result = createRequest(store, REQUESTS[event.index].input, { now: event.at });
      store = result.store;
      ids[event.index] = result.request.id;
    } else {
      store = applyAction(store, ids[event.index], event.action, {
        actor: event.actor,
        comment: event.comment ?? '',
        now: event.at,
      }).store;
    }
  }
  return store;
}
return { DEMO_COMPANY, DEMO_PEOPLE, DEMO_APPROVERS, buildSeedStore };
})();

modules["src/ui/stores.mjs"] = (() => {
  const { createRequest, applyAction } = modules["src/domain/store-core.mjs"];
  const { buildHandover } = modules["src/domain/export.mjs"];
  const { buildSeedStore } = modules["src/domain/seed.mjs"];
  const { DomainError } = modules["src/domain/errors.mjs"];
// Two interchangeable stores behind one interface:
//
//   load()                       -> { requests, log }
//   create(input)                -> { request, entry }
//   act(id, action, { actor, comment }) -> { request, entry }
//   exportBundle()               -> handover bundle
//   reset()                      -> void
//
// HttpStore talks to server.mjs. MemoryStore runs the same domain functions
// in the page, for when the app is opened straight from disk or served by a
// plain static server with no API.






const now = () => new Date().toISOString();

class MemoryStore {
  constructor() {
    this.mode = 'local';
    this.allowReset = true;
    this.description = 'Local demo mode: changes live in this tab and reset on reload.';
    this.state = buildSeedStore();
  }

  async load() {
    return { requests: this.state.requests, log: this.state.log };
  }

  async create(input) {
    const result = createRequest(this.state, input, { now: now() });
    this.state = result.store;
    return { request: result.request, entry: result.entry };
  }

  async act(id, action, { actor, comment }) {
    const result = applyAction(this.state, id, action, { actor, comment, now: now() });
    this.state = result.store;
    return { request: result.request, entry: result.entry };
  }

  async exportBundle() {
    return buildHandover(this.state, { exportedAt: now() });
  }

  async reset() {
    this.state = buildSeedStore();
  }
}

class HttpStore {
  constructor(base = '/api', { allowReset = true } = {}) {
    this.base = base;
    this.allowReset = allowReset;
    this.mode = 'server';
    this.description = 'Connected to the portal server: changes are saved to its JSON store.';
  }

  async #call(path, options = {}) {
    const response = await fetch(this.base + path, {
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = body.error ?? {};
      throw new DomainError(error.code ?? 'http_error', error.message ?? `Server responded ${response.status}.`, {
        fields: error.fields,
        status: response.status,
      });
    }
    return body;
  }

  async load() {
    const { requests, log } = await this.#call('/store');
    return { requests, log };
  }

  create(input) {
    return this.#call('/requests', { method: 'POST', body: JSON.stringify(input) });
  }

  act(id, action, { actor, comment }) {
    return this.#call(`/requests/${encodeURIComponent(id)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action, actor, comment }),
    });
  }

  exportBundle() {
    return this.#call('/export');
  }

  async reset() {
    await this.#call('/reset', { method: 'POST', body: '{}' });
  }
}

/** Use the server when one is answering, otherwise fall back to memory. */
async function connectStore() {
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    try {
      const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
      const health = response.ok ? await response.json() : null;
      if (health?.ok === true) return new HttpStore('/api', { allowReset: health.allowReset !== false });
    } catch {
      // No API here (for example a plain static file server): use memory.
    }
  }
  return new MemoryStore();
}
return { MemoryStore, HttpStore, connectStore };
})();

modules["src/domain/query.mjs"] = (() => {
  const { isState } = modules["src/domain/workflow.mjs"];
  const { REQUEST_TYPES } = modules["src/domain/validation.mjs"];
// Filtering, searching and sorting for the request list and activity log.




const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

const SORTS = Object.freeze(['newest', 'oldest', 'amount', 'priority']);

function haystack(request) {
  return [request.id, request.title, request.requester, request.department, request.vendor, request.system, request.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * @param {object[]} requests
 * @param {{state?: string, type?: string, q?: string, sort?: string}} [filters]
 */
function filterRequests(requests, filters = {}) {
  const state = isState(filters.state) ? filters.state : null;
  const type = REQUEST_TYPES.includes(filters.type) ? filters.type : null;
  const terms = String(filters.q ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const matched = requests.filter((request) => {
    if (state && request.state !== state) return false;
    if (type && request.type !== type) return false;
    if (terms.length === 0) return true;
    const text = haystack(request);
    return terms.every((term) => text.includes(term));
  });
  return sortRequests(matched, filters.sort);
}

function sortRequests(requests, sort = 'newest') {
  const byCreated = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);
  const copy = [...requests];
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => -byCreated(a, b));
    case 'amount':
      return copy.sort((a, b) => (b.amountCents ?? -1) - (a.amountCents ?? -1) || byCreated(a, b));
    case 'priority':
      return copy.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || byCreated(a, b));
    default:
      return copy.sort(byCreated);
  }
}

/** Activity entries, newest first, optionally for one request and capped at `limit`. */
function activityFor(log, { requestId, limit } = {}) {
  const entries = log
    .filter((entry) => !requestId || entry.requestId === requestId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
  return Number.isInteger(limit) && limit > 0 ? entries.slice(0, limit) : entries;
}
return { SORTS, filterRequests, sortRequests, activityFor };
})();

modules["src/domain/format.mjs"] = (() => {
// Small presentation helpers shared by the UI, the server and the exports.

function formatCents(cents, currency = 'USD') {
  if (cents === null || cents === undefined) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** "2d 4h", "3h 12m", "45m", "under 1m". Negative or invalid input gives "n/a". */
function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return 'n/a';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'under 1m';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

/** "Nov 18, 2026, 9:05 AM" in UTC, so every reader sees the same value. */
function formatTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}
return { formatCents, formatDuration, formatTimestamp };
})();

modules["src/ui/app.mjs"] = (() => {
  const { h, clear } = modules["src/ui/dom.mjs"];
  const { barChart } = modules["src/ui/chart.mjs"];
  const { connectStore } = modules["src/ui/stores.mjs"];
  const { STATES, STATE_LABELS, ACTIONS, availableActions } = modules["src/domain/workflow.mjs"];
  const { REQUEST_TYPES, TYPE_LABELS, DEPARTMENTS, PRIORITIES, validateRequestInput } = modules["src/domain/validation.mjs"];
  const { filterRequests, activityFor, SORTS } = modules["src/domain/query.mjs"];
  const { summarize } = modules["src/domain/metrics.mjs"];
  const { handoverFilename } = modules["src/domain/export.mjs"];
  const { formatCents, formatDuration, formatTimestamp } = modules["src/domain/format.mjs"];
  const { DEMO_PEOPLE } = modules["src/domain/seed.mjs"];
  const { isDomainError } = modules["src/domain/errors.mjs"];
// The browser app: hash routing, four views and the glue to the store.
// All business rules come from ../domain; this file only renders and wires.













const VERBS = {
  created: 'Submitted',
  start_review: 'Started review',
  approve: 'Approved',
  reject: 'Rejected',
  complete: 'Marked done',
  close: 'Closed',
};

const SORT_LABELS = { newest: 'Newest first', oldest: 'Oldest first', amount: 'Largest amount', priority: 'Highest priority' };

const TYPE_HINTS = {
  purchase: 'Spend that needs sign-off',
  supplier_onboarding: 'Add or extend a supplier',
  access: 'Access to an internal system',
};

const ui = {
  main: document.getElementById('main'),
  actorSelect: document.getElementById('actor-select'),
  exportButton: document.getElementById('export-button'),
  resetButton: document.getElementById('reset-button'),
  storeLabel: document.getElementById('store-label'),
  toast: document.getElementById('toast'),
  tabs: [...document.querySelectorAll('.tabs a')],
};

const app = {
  store: null,
  data: { requests: [], log: [] },
  filters: { q: '', state: '', type: '', sort: 'newest' },
  actor: readSavedActor(),
};

// ---------------------------------------------------------------- helpers

function readSavedActor() {
  try {
    const saved = window.localStorage.getItem('portal.actor');
    if (DEMO_PEOPLE.includes(saved)) return saved;
  } catch {
    // Storage can be unavailable (private windows, file:// in some browsers).
  }
  return DEMO_PEOPLE[0];
}

function saveActor(actor) {
  try {
    window.localStorage.setItem('portal.actor', actor);
  } catch {
    // Not fatal: the choice simply is not remembered.
  }
}

let toastTimer;
function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('is-visible'), 3200);
}

function parseRoute() {
  const [view = 'dashboard', id = null] = window.location.hash.replace(/^#\/?/, '').split('/');
  const known = ['dashboard', 'requests', 'new', 'activity'];
  return { view: known.includes(view) ? view : 'dashboard', id: id ? decodeURIComponent(id) : null };
}

function badge(state) {
  return h('span', { class: `badge badge-${state}` }, STATE_LABELS[state] ?? state);
}

function requestById(id) {
  return app.data.requests.find((request) => request.id === id) ?? null;
}

function pageHead(title, subtitle, ...extra) {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', { tabindex: -1 }, title), subtitle ? h('p', null, subtitle) : null), ...extra);
}

function errorMessage(error) {
  if (isDomainError(error)) return error.message;
  return 'Something went wrong. Please try again.';
}

async function refresh() {
  app.data = await app.store.load();
}

// ---------------------------------------------------------------- dashboard

function renderDashboard(main) {
  const now = new Date().toISOString();
  const summary = summarize(app.data.requests, { now });
  const decided = app.data.requests.filter((request) => request.decision).length;
  const approvals = app.data.requests.filter((request) => request.decision?.outcome === 'approved').length;

  const kpi = (label, value, note) =>
    h('div', { class: 'card kpi' }, h('p', { class: 'kpi-label' }, label), h('p', { class: 'kpi-value' }, value), h('p', { class: 'kpi-note' }, note));

  const chartData = STATES.map((state) => ({ label: STATE_LABELS[state], value: summary.byState[state] }));

  const aging = summary.agingOpen.map(requestById).filter(Boolean);
  const attention = aging.length
    ? h('ul', { class: 'request-list' }, aging.slice(0, 5).map((request) => h('li', null, requestLink(request))))
    : h('p', { class: 'empty' }, 'Nothing open for more than three days.');

  const recent = activityFor(app.data.log, { limit: 6 });

  main.append(
    pageHead('Dashboard', `${summary.total} requests in the portal, ${summary.open} open.`),
    h(
      'div',
      { class: 'grid-kpi' },
      kpi('Open requests', String(summary.open), `${summary.byState.new} new, ${summary.byState.in_review} in review`),
      kpi('Average time to approval', formatDuration(summary.averageTimeToApprovalMs ?? Number.NaN), `from submission, across ${approvals} approvals`),
      kpi('Approval rate', summary.approvalRate === null ? 'n/a' : `${Math.round(summary.approvalRate * 100)}%`, `of ${decided} decided requests`),
      kpi('Approved spend', formatCents(summary.approvedSpendCents), 'purchases approved to date'),
    ),
    h(
      'div',
      { class: 'grid-dash' },
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'chart-title' },
        h('div', { class: 'card-head' }, h('h2', { id: 'chart-title' }, 'Requests by state'), h('p', null, 'All requests, current state')),
        h('div', { class: 'card-body' }, barChart(chartData, { title: 'Requests by state' })),
      ),
      h(
        'div',
        { class: 'stack' },
        h(
          'section',
          { class: 'card', 'aria-labelledby': 'attention-title' },
          h('div', { class: 'card-head' }, h('h2', { id: 'attention-title' }, 'Needs attention'), h('p', null, 'Open for more than 3 days')),
          attention,
        ),
        h(
          'section',
          { class: 'card', 'aria-labelledby': 'recent-title' },
          h('div', { class: 'card-head' }, h('h2', { id: 'recent-title' }, 'Recent activity'), h('a', { href: '#/activity' }, 'View all')),
          h('div', { class: 'card-body' }, timeline(recent, { showRequest: true })),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- requests

function requestLink(request, selectedId) {
  const meta = [
    h('span', { class: 'id' }, request.id),
    h('span', null, TYPE_LABELS[request.type]),
    h('span', null, request.requester),
    request.amountCents !== null ? h('span', null, formatCents(request.amountCents)) : null,
    request.priority === 'high' ? h('span', { class: 'priority-high' }, 'High priority') : null,
  ];
  return h(
    'a',
    { class: 'request-link', href: `#/requests/${encodeURIComponent(request.id)}`, 'aria-current': request.id === selectedId ? 'true' : null },
    h('span', { class: 'request-title' }, request.title),
    badge(request.state),
    h('span', { class: 'request-meta' }, meta),
  );
}

function selectField(id, label, value, options, onChange) {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    h('select', { id, onchange: (event) => onChange(event.target.value) }, options.map(([optionValue, text]) =>
      h('option', { value: optionValue, selected: optionValue === value ? true : null }, text),
    )),
  );
}

function renderRequestsShell(main) {
  const setFilter = (key) => (value) => {
    app.filters[key] = value;
    updateRequestList();
  };
  const search = h('input', {
    id: 'filter-q',
    type: 'search',
    placeholder: 'Title, id, person, supplier or system',
    value: app.filters.q,
    autocomplete: 'off',
    oninput: (event) => setFilter('q')(event.target.value),
  });
  main.append(
    pageHead('Requests', 'Search, filter and act on every request.', h('a', { class: 'button', href: '#/new' }, 'New request')),
    h(
      'div',
      { class: 'toolbar', role: 'search' },
      h('div', { class: 'field' }, h('label', { for: 'filter-q' }, 'Search'), search),
      selectField('filter-state', 'State', app.filters.state, [['', 'All states'], ...STATES.map((s) => [s, STATE_LABELS[s]])], setFilter('state')),
      selectField('filter-type', 'Type', app.filters.type, [['', 'All types'], ...REQUEST_TYPES.map((t) => [t, TYPE_LABELS[t]])], setFilter('type')),
      selectField('filter-sort', 'Sort', app.filters.sort, SORTS.map((s) => [s, SORT_LABELS[s]]), setFilter('sort')),
    ),
    h('p', { class: 'result-count', id: 'result-count', 'aria-live': 'polite' }),
    h(
      'div',
      { class: 'split' },
      h('section', { class: 'card', 'aria-label': 'Request list' }, h('div', { id: 'request-list' })),
      h('section', { class: 'card', id: 'request-detail', 'aria-label': 'Request detail' }),
    ),
  );
}

function updateRequestList() {
  const container = document.getElementById('request-list');
  if (!container) return;
  const { id } = parseRoute();
  const results = filterRequests(app.data.requests, app.filters);
  document.getElementById('result-count').textContent =
    `${results.length} of ${app.data.requests.length} requests`;
  clear(container).append(
    results.length
      ? h('ul', { class: 'request-list' }, results.map((request) => h('li', null, requestLink(request, id))))
      : h('p', { class: 'empty' }, 'No requests match these filters.'),
  );
}

function fact(label, value) {
  return value === null || value === undefined || value === '' ? null : h('div', null, h('dt', null, label), h('dd', null, value));
}

function updateDetail() {
  const container = document.getElementById('request-detail');
  if (!container) return;
  clear(container);
  const { id } = parseRoute();
  const request = id ? requestById(id) : null;
  if (!request) {
    container.append(h('p', { class: 'empty' }, id ? `Request ${id} was not found.` : 'Select a request to see its details and act on it.'));
    return;
  }

  const decision = request.decision
    ? h(
      'div',
      { class: `decision decision-${request.decision.outcome}` },
      h('p', null, h('strong', null, `${request.decision.outcome === 'approved' ? 'Approved' : 'Rejected'} by ${request.decision.approver}`), ` · ${formatTimestamp(request.decision.at)}`),
      request.decision.comment ? h('p', null, request.decision.comment) : null,
    )
    : null;

  const parts = [
    h(
      'div',
      { class: 'detail-head' },
      h('div', { class: 'row' }, h('span', { class: 'id' }, request.id), badge(request.state)),
      h('h2', { id: 'detail-title', tabindex: -1 }, request.title),
    ),
    h(
      'dl',
      { class: 'facts' },
      fact('Type', TYPE_LABELS[request.type]),
      fact('Requester', request.requester),
      fact('Department', request.department),
      fact('Priority', request.priority[0].toUpperCase() + request.priority.slice(1)),
      fact('Amount', request.amountCents !== null ? formatCents(request.amountCents) : null),
      fact('Supplier', request.vendor),
      fact('System', request.system),
      fact('Needed by', request.neededBy),
      fact('Submitted', formatTimestamp(request.createdAt)),
    ),
    request.description ? h('div', { class: 'section' }, h('h3', null, 'Description'), h('p', { class: 'description' }, request.description)) : null,
    decision ? h('div', { class: 'section' }, h('h3', null, 'Decision'), decision) : null,
    actionsPanel(request),
    h('div', { class: 'section' }, h('h3', null, 'Activity'), timeline(activityFor(app.data.log, { requestId: request.id }))),
  ];
  container.append(...parts.filter(Boolean));
}

function actionsPanel(request) {
  const actions = availableActions(request.state);
  if (actions.length === 0) {
    return h('div', { class: 'section' }, h('p', { class: 'kpi-note' }, 'This request is done. No further actions.'));
  }
  const deciding = actions.includes('approve');
  const ownRequest = app.actor.toLowerCase() === request.requester.toLowerCase();
  const error = h('p', { class: 'form-error', id: 'action-error', role: 'alert' });
  const comment = h('textarea', { id: 'action-comment', maxlength: 1000, rows: 3, 'aria-describedby': 'action-comment-hint action-error' });

  const run = async (action, button) => {
    error.textContent = '';
    button.disabled = true;
    try {
      const result = await app.store.act(request.id, action, { actor: app.actor, comment: comment.value });
      await refresh();
      toast(`${request.id}: ${VERBS[action].toLowerCase()} by ${result.entry.actor}.`);
      updateRequestList();
      updateDetail();
      document.getElementById('detail-title')?.focus();
    } catch (failure) {
      error.textContent = errorMessage(failure);
      button.disabled = false;
      if (failure?.details?.fields?.comment) comment.focus();
    }
  };

  const buttons = actions.map((action) => {
    const kind = action === 'reject' ? 'button button-danger' : action === 'approve' ? 'button' : 'button button-secondary';
    const button = h('button', { type: 'button', class: kind }, ACTIONS[action].label);
    button.addEventListener('click', () => run(action, button));
    return button;
  });

  const hint = deciding
    ? ownRequest
      ? `You are acting as ${app.actor}, who raised this request. Switch "Acting as" to decide on it.`
      : `Deciding as ${app.actor}. A comment is required to reject.`
    : `Acting as ${app.actor}.`;

  return h(
    'div',
    { class: 'section' },
    h('h3', null, 'Next step'),
    h(
      'div',
      { class: 'actions-panel' },
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'action-comment' }, 'Comment ', h('span', { class: 'optional' }, deciding ? '(required to reject)' : '(optional)')),
        comment,
        h('p', { class: 'hint', id: 'action-comment-hint' }, hint),
      ),
      h('div', { class: 'actions-row' }, buttons),
      error,
    ),
  );
}

function timeline(entries, { showRequest = false } = {}) {
  if (entries.length === 0) return h('p', { class: 'kpi-note' }, 'No activity yet.');
  return h(
    'ol',
    { class: 'timeline' },
    entries.map((entry) =>
      h(
        'li',
        null,
        h(
          'div',
          null,
          h('p', null,
            h('strong', null, entry.actor), ' ', VERBS[entry.action]?.toLowerCase() ?? entry.action,
            showRequest ? [' ', h('a', { href: `#/requests/${encodeURIComponent(entry.requestId)}` }, entry.requestId)] : null),
          h('p', { class: 'when' }, formatTimestamp(entry.at)),
          entry.comment ? h('p', { class: 'comment' }, entry.comment) : null,
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- new request

function renderNewRequest(main) {
  const today = new Date().toISOString().slice(0, 10);
  const errorNodes = {};

  const field = (name, label, control, { hint, optional, span } = {}) => {
    const hintId = hint ? `hint-${name}` : null;
    errorNodes[name] = h('p', { class: 'error', id: `error-${name}` });
    control.setAttribute('aria-describedby', [hintId, `error-${name}`].filter(Boolean).join(' '));
    return h(
      'div',
      { class: `field${span ? ' span-2' : ''}`, 'data-field': name },
      h('label', { for: control.id }, label, optional ? h('span', { class: 'optional' }, ' (optional)') : null),
      control,
      hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
      errorNodes[name],
    );
  };

  const typeOptions = h(
    'fieldset',
    { class: 'field span-2', 'aria-describedby': 'error-type' },
    h('legend', null, 'Request type'),
    h('div', { class: 'type-options' }, REQUEST_TYPES.map((type) =>
      h('label', { class: 'type-option' },
        h('input', { type: 'radio', name: 'type', value: type, checked: type === 'purchase' }),
        h('span', null, h('strong', null, TYPE_LABELS[type]), h('small', null, TYPE_HINTS[type]))),
    )),
    (errorNodes.type = h('p', { class: 'error', id: 'error-type' })),
  );

  const form = h(
    'form',
    { class: 'card form-card', novalidate: true },
    h(
      'div',
      { class: 'form-grid' },
      typeOptions,
      field('title', 'Title', h('input', { id: 'f-title', name: 'title', maxlength: 120, autocomplete: 'off' }), {
        span: true,
        hint: 'One line a reviewer can scan, for example "Label printers for packing stations".',
      }),
      field('requester', 'Requester', h('input', { id: 'f-requester', name: 'requester', value: app.actor, autocomplete: 'off' })),
      field('department', 'Department', h('select', { id: 'f-department', name: 'department' },
        h('option', { value: '' }, 'Choose…'), DEPARTMENTS.map((d) => h('option', { value: d }, d)))),
      field('amount', 'Amount (USD)', h('input', { id: 'f-amount', name: 'amount', inputmode: 'decimal', placeholder: '1,250.00' })),
      field('vendor', 'Supplier', h('input', { id: 'f-vendor', name: 'vendor', autocomplete: 'off' })),
      field('system', 'System', h('input', { id: 'f-system', name: 'system', placeholder: 'Warehouse management system' })),
      field('priority', 'Priority', h('select', { id: 'f-priority', name: 'priority' },
        PRIORITIES.map((p) => h('option', { value: p, selected: p === 'normal' ? true : null }, p[0].toUpperCase() + p.slice(1))))),
      field('neededBy', 'Needed by', h('input', { id: 'f-neededBy', name: 'neededBy', type: 'date', min: today }), { optional: true }),
      field('description', 'Description', h('textarea', { id: 'f-description', name: 'description', maxlength: 2000, rows: 4 }), {
        span: true,
        optional: true,
        hint: 'Context the approver needs: quotes, reasons, deadlines.',
      }),
    ),
    h('p', { class: 'form-error form-error-inset', role: 'alert', id: 'form-error' }),
    h('div', { class: 'form-foot' }, h('a', { class: 'button button-secondary', href: '#/requests' }, 'Cancel'), h('button', { class: 'button', type: 'submit' }, 'Submit request')),
  );

  const formError = form.querySelector('#form-error');

  const visibleFields = (type) => ({
    amount: type === 'purchase',
    vendor: type === 'purchase' || type === 'supplier_onboarding',
    system: type === 'access',
  });

  const syncType = () => {
    const type = new FormData(form).get('type');
    for (const [name, visible] of Object.entries(visibleFields(type))) {
      form.querySelector(`[data-field="${name}"]`).hidden = !visible;
    }
  };

  const showErrors = (errors) => {
    for (const [name, node] of Object.entries(errorNodes)) {
      node.textContent = errors[name] ?? '';
      const control = form.querySelector(`[name="${name}"]`);
      if (control && name !== 'type') control.setAttribute('aria-invalid', errors[name] ? 'true' : 'false');
    }
    const names = Object.keys(errors);
    formError.textContent = names.length ? `Please correct ${names.length} field${names.length > 1 ? 's' : ''} below.` : '';
    const first = names.map((name) => form.querySelector(`[name="${name}"]`)).find(Boolean);
    first?.focus();
  };

  form.addEventListener('change', (event) => {
    if (event.target.name === 'type') syncType();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form).entries());
    const check = validateRequestInput(input, { today });
    if (!check.ok) return showErrors(check.errors);
    showErrors({});
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const { request } = await app.store.create(input);
      await refresh();
      toast(`${request.id} submitted.`);
      window.location.hash = `#/requests/${encodeURIComponent(request.id)}`;
    } catch (failure) {
      submit.disabled = false;
      if (failure?.details?.fields) showErrors(failure.details.fields);
      else formError.textContent = errorMessage(failure);
    }
  });

  main.append(pageHead('New request', 'Submit a purchase, supplier or access request for review.'), form);
  syncType();
}

// ---------------------------------------------------------------- activity

function renderActivity(main) {
  const entries = activityFor(app.data.log);
  const titles = new Map(app.data.requests.map((request) => [request.id, request.title]));
  main.append(
    pageHead('Activity', `Every change, newest first. ${entries.length} entries.`),
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          null,
          h('caption', { class: 'sr-only' }, 'Activity log'),
          h('thead', null, h('tr', null, ['When', 'Who', 'Request', 'What', 'Comment'].map((label) => h('th', { scope: 'col' }, label)))),
          h('tbody', null, entries.map((entry) =>
            h(
              'tr',
              null,
              h('td', { class: 'nowrap' }, formatTimestamp(entry.at)),
              h('td', null, entry.actor),
              h('td', null, h('a', { href: `#/requests/${encodeURIComponent(entry.requestId)}`, class: 'id' }, entry.requestId), h('br'), titles.get(entry.requestId) ?? ''),
              h('td', { class: 'nowrap' }, VERBS[entry.action] ?? entry.action, entry.to ? [' ', h('br'), badge(entry.to)] : null),
              h('td', null, entry.comment),
            ),
          )),
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------- routing

let currentView = null;
let hasRendered = false;

function render() {
  const { view } = parseRoute();
  for (const tab of ui.tabs) tab.setAttribute('aria-current', tab.dataset.route === view ? 'page' : 'false');
  const viewChanged = view !== currentView;

  if (view === 'requests' && !viewChanged) {
    updateRequestList();
    updateDetail();
    document.getElementById('detail-title')?.focus();
    return;
  }

  currentView = view;
  clear(ui.main);
  if (view === 'dashboard') renderDashboard(ui.main);
  else if (view === 'new') renderNewRequest(ui.main);
  else if (view === 'activity') renderActivity(ui.main);
  else {
    renderRequestsShell(ui.main);
    updateRequestList();
    updateDetail();
  }
  // Move focus to the new heading when the person navigates, not on first load.
  if (viewChanged && hasRendered) ui.main.querySelector('h1')?.focus();
  hasRendered = true;
}

function rerender() {
  currentView = null;
  render();
}

async function exportHandover() {
  ui.exportButton.disabled = true;
  try {
    const bundle = await app.store.exportBundle();
    const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: handoverFilename(bundle.exportedAt) });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Handover export ready: ${bundle.requests.length} requests, ${bundle.log.length} log entries.`);
  } catch (failure) {
    toast(`Export failed: ${errorMessage(failure)}`);
  } finally {
    ui.exportButton.disabled = false;
  }
}

async function resetData() {
  if (!window.confirm('Reset the demo data? Every change made here is replaced by the original demo requests.')) return;
  try {
    await app.store.reset();
    await refresh();
    rerender();
    toast('Demo data restored.');
  } catch (failure) {
    toast(`Reset failed: ${errorMessage(failure)}`);
  }
}

async function start() {
  for (const person of DEMO_PEOPLE) {
    ui.actorSelect.append(h('option', { value: person, selected: person === app.actor ? true : null }, person));
  }
  ui.actorSelect.addEventListener('change', () => {
    app.actor = ui.actorSelect.value;
    saveActor(app.actor);
    if (currentView === 'requests') updateDetail();
  });
  ui.exportButton.addEventListener('click', exportHandover);
  ui.resetButton.addEventListener('click', resetData);
  window.addEventListener('hashchange', render);

  try {
    app.store = await connectStore();
    ui.storeLabel.textContent = app.store.description;
    ui.resetButton.hidden = !app.store.allowReset;
    await refresh();
    render();
  } catch (failure) {
    clear(ui.main).append(h('p', { class: 'loading' }, `The portal could not load: ${errorMessage(failure)}`));
  }
}

start();
return {  };
})();
})();
