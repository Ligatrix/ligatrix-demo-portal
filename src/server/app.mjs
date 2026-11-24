// HTTP layer: a small JSON API over the domain modules, plus a static file
// server for the browser app. No framework; every route is listed below.
//
//   GET  /api/health                     liveness and schema version
//   GET  /api/store                      all requests and the activity log
//   GET  /api/requests?state&type&q&sort filtered request list
//   GET  /api/requests/:id               one request with its activity
//   POST /api/requests                   create a request (intake form fields)
//   POST /api/requests/:id/actions       { action, actor, comment }
//   GET  /api/summary                    dashboard figures
//   GET  /api/export                     handover bundle (download)
//   POST /api/reset                      reload the demo data (if enabled)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { createRequest, applyAction, findRequest, SCHEMA_VERSION } from '../domain/store-core.mjs';
import { filterRequests, activityFor } from '../domain/query.mjs';
import { summarize } from '../domain/metrics.mjs';
import { buildHandover, handoverFilename } from '../domain/export.mjs';
import { isDomainError, ERROR_CODES } from '../domain/errors.mjs';

const MAX_BODY_BYTES = 64 * 1024;

const STATUS_BY_CODE = {
  [ERROR_CODES.VALIDATION]: 400,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.INVALID_TRANSITION]: 409,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

// Only these parts of the repository are served to the browser.
const PUBLIC_PREFIXES = ['src/domain/', 'src/ui/', 'dist/'];
const PUBLIC_FILES = ['index.html', 'favicon.svg'];

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(payload);
}

async function readJsonBody(req) {
  const type = req.headers['content-type'] ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Send the body as application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large', 'Request body is too large.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body must be a JSON object.');
  }
}

/** Resolve a URL path to a servable file under `root`, or null. */
export function resolveStaticPath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = normalize(decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, ''));
  if (relative.startsWith('..') || relative.split(sep).some((part) => part.startsWith('.'))) return null;
  const posix = relative.split(sep).join('/');
  const allowed = PUBLIC_FILES.includes(posix) || PUBLIC_PREFIXES.some((prefix) => posix.startsWith(prefix));
  if (!allowed || !MIME[extname(posix)]) return null;
  return join(root, relative);
}

/**
 * @param {{store: import('./file-store.mjs').FileStore, root: string, seed: () => object,
 *          clock?: () => string, allowReset?: boolean}} options
 */
export function createPortalServer({ store, root, seed, clock = () => new Date().toISOString(), allowReset = true }) {
  async function handleApi(req, res, url) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
    const method = req.method;

    if (method === 'GET' && parts[0] === 'health' && parts.length === 1) {
      return sendJson(res, 200, { ok: true, schemaVersion: SCHEMA_VERSION, requests: store.get().requests.length, allowReset });
    }
    if (method === 'GET' && parts[0] === 'store' && parts.length === 1) {
      const { requests, log } = store.get();
      return sendJson(res, 200, { schemaVersion: SCHEMA_VERSION, requests, log });
    }
    if (parts[0] === 'requests' && parts.length === 1) {
      if (method === 'GET') {
        const filters = Object.fromEntries(['state', 'type', 'q', 'sort'].map((key) => [key, url.searchParams.get(key) ?? undefined]));
        const requests = filterRequests(store.get().requests, filters);
        return sendJson(res, 200, { count: requests.length, requests });
      }
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const result = await store.update((current) => createRequest(current, body, { now: clock() }));
        return sendJson(res, 201, { request: result.request, entry: result.entry }, { Location: `/api/requests/${result.request.id}` });
      }
    }
    if (parts[0] === 'requests' && parts.length === 2 && method === 'GET') {
      const request = findRequest(store.get(), parts[1]);
      if (!request) throw new HttpError(404, ERROR_CODES.NOT_FOUND, `Request ${parts[1]} was not found.`);
      return sendJson(res, 200, { request, activity: activityFor(store.get().log, { requestId: request.id }) });
    }
    if (parts[0] === 'requests' && parts.length === 3 && parts[2] === 'actions' && method === 'POST') {
      const body = await readJsonBody(req);
      const result = await store.update((current) =>
        applyAction(current, parts[1], String(body.action ?? ''), { actor: body.actor, comment: body.comment, now: clock() }),
      );
      return sendJson(res, 200, { request: result.request, entry: result.entry });
    }
    if (method === 'GET' && parts[0] === 'summary' && parts.length === 1) {
      return sendJson(res, 200, summarize(store.get().requests, { now: clock() }));
    }
    if (method === 'GET' && parts[0] === 'export' && parts.length === 1) {
      const exportedAt = clock();
      return sendJson(res, 200, buildHandover(store.get(), { exportedAt }), {
        'Content-Disposition': `attachment; filename="${handoverFilename(exportedAt)}"`,
      });
    }
    if (method === 'POST' && parts[0] === 'reset' && parts.length === 1) {
      if (!allowReset) throw new HttpError(403, ERROR_CODES.FORBIDDEN, 'Reset is disabled on this server.');
      await store.update(() => ({ store: seed() }));
      return sendJson(res, 200, { ok: true, requests: store.get().requests.length });
    }
    throw new HttpError(404, 'not_found', `No route for ${method} ${url.pathname}.`);
  }

  async function handleStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
    }
    const file = resolveStaticPath(root, url.pathname);
    if (!file) throw new HttpError(404, 'not_found', 'Not found.');
    let body;
    try {
      body = await readFile(file);
    } catch {
      throw new HttpError(404, 'not_found', 'Not found.');
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[extname(file)], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await handleStatic(req, res, url);
    } catch (error) {
      if (error instanceof HttpError) {
        return sendJson(res, error.status, { error: { code: error.code, message: error.message } });
      }
      if (isDomainError(error)) {
        return sendJson(res, STATUS_BY_CODE[error.code] ?? 400, {
          error: { code: error.code, message: error.message, fields: error.details?.fields },
        });
      }
      console.error(error);
      return sendJson(res, 500, { error: { code: 'internal_error', message: 'Something went wrong on the server.' } });
    }
  });
}
