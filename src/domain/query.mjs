// Filtering, searching and sorting for the request list and activity log.

import { isState } from './workflow.mjs';
import { REQUEST_TYPES } from './validation.mjs';

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

export const SORTS = Object.freeze(['newest', 'oldest', 'amount', 'priority']);

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
export function filterRequests(requests, filters = {}) {
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

export function sortRequests(requests, sort = 'newest') {
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
export function activityFor(log, { requestId, limit } = {}) {
  const entries = log
    .filter((entry) => !requestId || entry.requestId === requestId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
  return Number.isInteger(limit) && limit > 0 ? entries.slice(0, limit) : entries;
}
