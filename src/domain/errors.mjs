// A single error type for every rule the domain enforces. `code` is stable and
// machine-readable; the server maps it to an HTTP status, the UI to a message.

export const ERROR_CODES = Object.freeze({
  VALIDATION: 'validation_failed',
  NOT_FOUND: 'not_found',
  INVALID_TRANSITION: 'invalid_transition',
  FORBIDDEN: 'forbidden',
  BAD_BUNDLE: 'bad_bundle',
});

export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(value) {
  return value instanceof DomainError || (value !== null && typeof value === 'object' && value.name === 'DomainError');
}
