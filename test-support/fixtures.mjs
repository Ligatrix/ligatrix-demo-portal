// Shared fixtures for the test suite.

export const NOW = '2026-11-24T10:00:00.000Z';

export function purchaseInput(overrides = {}) {
  return {
    title: 'Pallet wrap for dock 2',
    type: 'purchase',
    department: 'Warehouse',
    requester: 'Leo',
    priority: 'normal',
    amount: '640.00',
    vendor: 'Quarrow Packaging',
    description: 'Monthly restock.',
    ...overrides,
  };
}

export function requestRecord(overrides = {}) {
  return {
    id: 'REQ-1001',
    title: 'Pallet wrap for dock 2',
    type: 'purchase',
    department: 'Warehouse',
    requester: 'Leo',
    priority: 'normal',
    description: '',
    amountCents: 64000,
    vendor: 'Quarrow Packaging',
    system: null,
    neededBy: null,
    state: 'new',
    createdAt: '2026-11-20T09:00:00.000Z',
    updatedAt: '2026-11-20T09:00:00.000Z',
    reviewStartedAt: null,
    decision: null,
    ...overrides,
  };
}
