import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore } from '../src/server/file-store.mjs';
import { createPortalServer, resolveStaticPath } from '../src/server/app.mjs';
import { buildSeedStore } from '../src/domain/seed.mjs';
import { validateStore } from '../src/domain/export.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLOCK = () => '2026-11-24T10:00:00.000Z';

let dir;
let server;
let base;
let dataFile;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'portal-test-'));
  dataFile = join(dir, 'nested', 'store.json');
  const store = new FileStore(dataFile, { seed: buildSeedStore });
  await store.open();
  server = createPortalServer({ store, root: ROOT, seed: buildSeedStore, clock: CLOCK });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((done) => server.close(done));
  await rm(dir, { recursive: true, force: true });
});

const post = (path, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(base + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('health reports the schema version and request count', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, schemaVersion: 1, requests: 12 });
});

test('a missing store file is created from the seed', async () => {
  assert.equal(validateStore(JSON.parse(await readFile(dataFile, 'utf8'))).ok, true);
});

test('the request list supports filters through query parameters', async () => {
  const res = await fetch(`${base}/api/requests?type=access&sort=oldest`);
  const body = await res.json();
  assert.ok(body.count > 0);
  assert.ok(body.requests.every((request) => request.type === 'access'));
});

test('creating a request returns 201, a Location header, and persists to disk', async () => {
  const res = await post('/api/requests', {
    title: 'Dock door gaskets', type: 'purchase', department: 'Warehouse', requester: 'Nora', amount: '920', vendor: 'Ostrander Pallet Co.',
  });
  assert.equal(res.status, 201);
  const { request } = await res.json();
  assert.equal(res.headers.get('location'), `/api/requests/${request.id}`);
  assert.equal(request.createdAt, CLOCK());
  const onDisk = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.ok(onDisk.requests.some((item) => item.id === request.id));
});

test('invalid intake returns 400 with field errors', async () => {
  const res = await post('/api/requests', { title: 'x', type: 'purchase' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'validation_failed');
  assert.ok(body.error.fields.title && body.error.fields.amount);
});

test('workflow actions map domain errors to 409, 403 and 404', async () => {
  const created = await (await post('/api/requests', {
    title: 'Scanner access', type: 'access', department: 'IT', requester: 'Sam', system: 'Inventory reports',
  })).json();
  const id = created.request.id;

  assert.equal((await post(`/api/requests/${id}/actions`, { action: 'approve', actor: 'Dana' })).status, 409);
  assert.equal((await post(`/api/requests/${id}/actions`, { action: 'start_review', actor: 'Dana' })).status, 200);
  assert.equal((await post(`/api/requests/${id}/actions`, { action: 'approve', actor: 'Sam' })).status, 403);
  const approved = await post(`/api/requests/${id}/actions`, { action: 'approve', actor: 'Dana', comment: 'Fine.' });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).request.decision.approver, 'Dana');
  assert.equal((await post('/api/requests/REQ-9999/actions', { action: 'start_review', actor: 'Dana' })).status, 404);

  const detail = await (await fetch(`${base}/api/requests/${id}`)).json();
  assert.deepEqual(detail.activity.map((entry) => entry.action), ['approve', 'start_review', 'created']);
});

test('bad bodies are refused: wrong content type, broken JSON, oversize', async () => {
  assert.equal((await post('/api/requests', '{}', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/requests', '{nope')).status, 400);
  assert.equal((await post('/api/requests', '[1,2]')).status, 400);
  assert.equal((await post('/api/requests', JSON.stringify({ description: 'x'.repeat(70_000) }))).status, 413);
});

test('export downloads a handover bundle as an attachment', async () => {
  const res = await fetch(`${base}/api/export`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="corvane-handover-20261124T100000Z\.json"/);
  const bundle = await res.json();
  assert.equal(bundle.format, 'corvane-portal-handover');
  assert.equal(validateStore(bundle).ok, true);
});

test('summary returns dashboard figures', async () => {
  const summary = await (await fetch(`${base}/api/summary`)).json();
  assert.equal(typeof summary.byState.new, 'number');
  assert.ok(summary.averageTimeToApprovalMs > 0);
});

test('reset reloads the demo data', async () => {
  const res = await post('/api/reset', {});
  assert.deepEqual(await res.json(), { ok: true, requests: 12 });
});

test('unknown API routes return JSON 404', async () => {
  const res = await fetch(`${base}/api/nothing`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'not_found');
});

test('static files are served with security headers, and only from public paths', async () => {
  const module = await fetch(`${base}/src/domain/workflow.mjs`);
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /text\/javascript/);
  assert.match(module.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(module.headers.get('x-content-type-options'), 'nosniff');
  for (const path of ['/package.json', '/server.mjs', '/data/store.json', '/src/server/app.mjs', '/.git/config', '/src/domain/%2e%2e/%2e%2e/package.json']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});

test('resolveStaticPath blocks traversal, dotfiles and bad encoding', () => {
  assert.equal(resolveStaticPath('/srv', '/../etc/passwd'), null);
  assert.equal(resolveStaticPath('/srv', '/src/ui/.hidden.mjs'), null);
  assert.equal(resolveStaticPath('/srv', '/%E0%A4%A'), null);
  assert.equal(resolveStaticPath('/srv', '/src/ui/app.mjs'), join('/srv', 'src/ui/app.mjs'));
});

test('FileStore refuses to start on a corrupt or inconsistent file', async () => {
  const broken = join(dir, 'broken.json');
  await writeFile(broken, '{ not json');
  await assert.rejects(new FileStore(broken, { seed: buildSeedStore }).open(), /not valid JSON/);
  const drifted = buildSeedStore();
  drifted.requests[0].state = 'new';
  await writeFile(broken, JSON.stringify(drifted));
  await assert.rejects(new FileStore(broken, { seed: buildSeedStore }).open(), /integrity check/);
});

test('FileStore applies concurrent updates one after another', async () => {
  const file = join(dir, 'queue.json');
  const store = new FileStore(file, { seed: () => ({ schemaVersion: 1, requests: [], log: [], n: 0 }) });
  await store.open();
  await Promise.all(Array.from({ length: 20 }, () => store.update((s) => ({ store: { ...s, n: s.n + 1 } }))));
  assert.equal(store.get().n, 20);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).n, 20);
});

test('a failed update leaves the store and the file unchanged', async () => {
  const file = join(dir, 'fail.json');
  const store = new FileStore(file, { seed: buildSeedStore });
  await store.open();
  const before = await readFile(file, 'utf8');
  await assert.rejects(store.update(() => { throw new Error('boom'); }), /boom/);
  assert.equal(await readFile(file, 'utf8'), before);
  assert.equal(store.get().requests.length, 12);
});
