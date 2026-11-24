// Intake validation. `validateRequestInput` takes raw form or JSON input and
// returns either a normalised value ready to store or a map of field errors
// written for the person filling in the form.

export const REQUEST_TYPES = Object.freeze(['purchase', 'supplier_onboarding', 'access']);

export const TYPE_LABELS = Object.freeze({
  purchase: 'Purchase approval',
  supplier_onboarding: 'Supplier onboarding',
  access: 'Access request',
});

export const DEPARTMENTS = Object.freeze(['Operations', 'Finance', 'Warehouse', 'Procurement', 'Sales', 'IT']);

export const PRIORITIES = Object.freeze(['low', 'normal', 'high']);

export const LIMITS = Object.freeze({
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
export function parseAmountToCents(value) {
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
export function isIsoDate(value) {
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
export function validateRequestInput(input, options = {}) {
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
