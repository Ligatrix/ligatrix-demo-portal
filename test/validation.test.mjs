import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequestInput, parseAmountToCents, isIsoDate } from '../src/domain/validation.mjs';
import { purchaseInput } from '../test-support/fixtures.mjs';

test('a complete purchase is accepted and normalised', () => {
  const result = validateRequestInput(purchaseInput({ title: '  Pallet   wrap for dock 2 ', amount: '$1,250.5' }));
  assert.equal(result.ok, true);
  assert.equal(result.value.title, 'Pallet wrap for dock 2');
  assert.equal(result.value.amountCents, 125050);
  assert.equal(result.value.system, null);
});

test('missing input reports every required field', () => {
  const result = validateRequestInput(undefined);
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['department', 'requester', 'title', 'type']);
});

test('purchases need an amount and a supplier', () => {
  const result = validateRequestInput(purchaseInput({ amount: '', vendor: '' }));
  assert.equal(result.ok, false);
  assert.match(result.errors.amount, /required/);
  assert.match(result.errors.vendor, /required/);
});

test('amounts must be positive, at most two decimals and under the limit', () => {
  assert.match(validateRequestInput(purchaseInput({ amount: '0' })).errors.amount, /greater than zero/);
  assert.match(validateRequestInput(purchaseInput({ amount: '12.345' })).errors.amount, /such as/);
  assert.match(validateRequestInput(purchaseInput({ amount: '-5' })).errors.amount, /such as/);
  assert.match(validateRequestInput(purchaseInput({ amount: '1000000.01' })).errors.amount, /or less/);
  assert.equal(validateRequestInput(purchaseInput({ amount: 1000000 })).ok, true);
});

test('supplier onboarding needs a supplier but no amount', () => {
  const result = validateRequestInput(purchaseInput({ type: 'supplier_onboarding', amount: 'ignored' }));
  assert.equal(result.ok, true);
  assert.equal(result.value.amountCents, null);
  assert.equal(validateRequestInput(purchaseInput({ type: 'supplier_onboarding', vendor: '' })).ok, false);
});

test('access requests need a system and drop supplier fields', () => {
  const missing = validateRequestInput(purchaseInput({ type: 'access' }));
  assert.match(missing.errors.system, /required/);
  const ok = validateRequestInput(purchaseInput({ type: 'access', system: 'Inventory reports' }));
  assert.equal(ok.ok, true);
  assert.equal(ok.value.vendor, null);
  assert.equal(ok.value.amountCents, null);
});

test('unknown type, department and priority are refused', () => {
  const result = validateRequestInput(purchaseInput({ type: 'travel', department: 'Legal', priority: 'urgent' }));
  assert.deepEqual(Object.keys(result.errors).sort(), ['department', 'priority', 'type']);
});

test('priority defaults to normal', () => {
  assert.equal(validateRequestInput(purchaseInput({ priority: '' })).value.priority, 'normal');
});

test('title length limits are enforced', () => {
  assert.match(validateRequestInput(purchaseInput({ title: 'abc' })).errors.title, /at least 4/);
  assert.match(validateRequestInput(purchaseInput({ title: 'a'.repeat(121) })).errors.title, /120 characters/);
});

test('description keeps line breaks and has a maximum', () => {
  assert.equal(validateRequestInput(purchaseInput({ description: 'line one\r\nline two' })).value.description, 'line one\nline two');
  assert.ok(validateRequestInput(purchaseInput({ description: 'x'.repeat(2001) })).errors.description);
});

test('needed-by must be a real date and not in the past', () => {
  assert.ok(validateRequestInput(purchaseInput({ neededBy: '2026-02-30' })).errors.neededBy);
  assert.match(validateRequestInput(purchaseInput({ neededBy: '2026-11-01' }), { today: '2026-11-24' }).errors.neededBy, /past/);
  assert.equal(validateRequestInput(purchaseInput({ neededBy: '2026-11-24' }), { today: '2026-11-24' }).ok, true);
  assert.equal(validateRequestInput(purchaseInput({ neededBy: '' })).value.neededBy, null);
});

test('parseAmountToCents handles numbers, strings and junk', () => {
  assert.equal(parseAmountToCents(19.99), 1999);
  assert.equal(parseAmountToCents('0.1'), 10);
  assert.equal(parseAmountToCents('1e3'), null);
  assert.equal(parseAmountToCents(Number.NaN), null);
  assert.equal(parseAmountToCents({}), null);
});

test('isIsoDate accepts leap days only in leap years', () => {
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2026-1-5'), false);
});
