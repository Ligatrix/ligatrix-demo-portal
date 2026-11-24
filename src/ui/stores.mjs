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

import { createRequest, applyAction } from '../domain/store-core.mjs';
import { buildHandover } from '../domain/export.mjs';
import { buildSeedStore } from '../domain/seed.mjs';
import { DomainError } from '../domain/errors.mjs';

const now = () => new Date().toISOString();

export class MemoryStore {
  constructor() {
    this.mode = 'local';
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

export class HttpStore {
  constructor(base = '/api') {
    this.base = base;
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
export async function connectStore() {
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    try {
      const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
      if (response.ok && (await response.json()).ok === true) return new HttpStore();
    } catch {
      // No API here (for example a plain static file server): use memory.
    }
  }
  return new MemoryStore();
}
