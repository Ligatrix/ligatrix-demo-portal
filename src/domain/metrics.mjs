// Dashboard figures, computed from the requests alone.

import { STATES, OPEN_STATES } from './workflow.mjs';

const HOUR = 3_600_000;

export function countByState(requests) {
  const counts = Object.fromEntries(STATES.map((state) => [state, 0]));
  for (const request of requests) {
    if (Object.prototype.hasOwnProperty.call(counts, request.state)) counts[request.state] += 1;
  }
  return counts;
}

/** Milliseconds from submission to approval for every approved request. */
export function approvalDurations(requests) {
  const durations = [];
  for (const request of requests) {
    if (request.decision?.outcome !== 'approved') continue;
    const ms = Date.parse(request.decision.at) - Date.parse(request.createdAt);
    if (Number.isFinite(ms) && ms >= 0) durations.push(ms);
  }
  return durations;
}

/** Mean time to approval in milliseconds, or null when nothing is approved yet. */
export function averageTimeToApprovalMs(requests) {
  const durations = approvalDurations(requests);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length);
}

/** Share of decided requests that were approved (0..1), or null when none are decided. */
export function approvalRate(requests) {
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
export function agingOpenRequests(requests, { now, thresholdHours = 72 }) {
  const cutoff = Date.parse(now) - thresholdHours * HOUR;
  return requests
    .filter((request) => OPEN_STATES.includes(request.state) && Date.parse(request.createdAt) <= cutoff)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Total value of approved purchases, in cents, including those since marked done. */
export function approvedSpendCents(requests) {
  return requests
    .filter((request) => request.decision?.outcome === 'approved' && Number.isInteger(request.amountCents))
    .reduce((sum, request) => sum + request.amountCents, 0);
}

export function summarize(requests, { now }) {
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
