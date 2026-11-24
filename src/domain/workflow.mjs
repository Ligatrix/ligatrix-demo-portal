// The request lifecycle as an explicit state machine.
//
//   new ──start_review──▶ in_review ──approve──▶ approved ──complete──▶ done
//                              │
//                              └────reject───▶ rejected ──close──▶ done
//
// Every change of state goes through `transition`, which checks the move is
// allowed, enforces the guard for that action and returns a new request plus
// the activity entry describing it. Nothing here mutates its inputs.

import { DomainError, ERROR_CODES } from './errors.mjs';

export const STATES = Object.freeze(['new', 'in_review', 'approved', 'rejected', 'done']);

export const STATE_LABELS = Object.freeze({
  new: 'New',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  done: 'Done',
});

export const ACTIONS = Object.freeze({
  start_review: Object.freeze({ from: 'new', to: 'in_review', label: 'Start review' }),
  approve: Object.freeze({ from: 'in_review', to: 'approved', label: 'Approve' }),
  reject: Object.freeze({ from: 'in_review', to: 'rejected', label: 'Reject' }),
  complete: Object.freeze({ from: 'approved', to: 'done', label: 'Mark done' }),
  close: Object.freeze({ from: 'rejected', to: 'done', label: 'Close' }),
});

export const TERMINAL_STATES = Object.freeze(['done']);
export const OPEN_STATES = Object.freeze(['new', 'in_review']);

export const COMMENT_MAX = 1000;

export function isState(value) {
  return STATES.includes(value);
}

export function isAction(value) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, value);
}

/** Actions that may be taken from a state, in a stable order. */
export function availableActions(state) {
  return Object.keys(ACTIONS).filter((name) => ACTIONS[name].from === state);
}

export function canTransition(state, action) {
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
export function transition(request, action, context) {
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
