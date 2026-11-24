// Demo data for Corvane Supply Co., a fictional distributor used in this demo.
// Every supplier, system and first name below is invented.
//
// The seed is not a static snapshot: it is a timeline of intake and workflow
// steps replayed through the same functions the portal uses, so the seeded
// requests, decisions and activity log are always consistent with the rules.

import { createRequest, applyAction, emptyStore } from './store-core.mjs';

export const DEMO_COMPANY = 'Corvane Supply Co., a fictional distributor used in this demo';

export const DEMO_PEOPLE = Object.freeze(['Dana', 'Marco', 'Ines', 'Leo', 'Maya', 'Sam', 'Nora', 'Owen']);

export const DEMO_APPROVERS = Object.freeze(['Dana', 'Marco', 'Ines']);

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
export function buildSeedStore() {
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
