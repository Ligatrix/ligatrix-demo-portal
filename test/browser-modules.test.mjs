import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { buildBundle, transform, OUTPUT } from '../scripts/bundle.mjs';
import { MemoryStore } from '../src/ui/stores.mjs';
import { niceMax } from '../src/ui/chart.mjs';
import { validateStore } from '../src/domain/export.mjs';

test('the checked-in bundle matches the current sources (run `npm run bundle` if this fails)', () => {
  assert.equal(readFileSync(OUTPUT, 'utf8'), buildBundle());
});

test('the bundle is valid JavaScript and contains every module the app imports', () => {
  const text = buildBundle();
  assert.doesNotThrow(() => new Script(text));
  for (const name of ['workflow', 'validation', 'store-core', 'metrics', 'query', 'export', 'seed', 'format']) {
    assert.ok(text.includes(`modules["src/domain/${name}.mjs"]`), name);
  }
  assert.ok(!/^import\s|^export\s/m.test(text));
});

test('transform rewrites named imports and exports, including renames', () => {
  const result = transform('x.mjs', "import { a, b as c } from './y.mjs';\nexport const one = 1;\nexport async function two() {}\nconst three = 3;\nexport { three as four };\n");
  assert.deepEqual(result.imports, [{ from: './y.mjs', specifiers: [{ imported: 'a', local: 'a' }, { imported: 'b', local: 'c' }] }]);
  assert.deepEqual(result.exported, ['one', 'two', 'four: three']);
  assert.ok(!result.body.includes('export'));
});

test('transform refuses import and export forms it cannot bundle safely', () => {
  assert.throws(() => transform('x.mjs', "import * as all from './y.mjs';\n"), /unsupported import/);
  assert.throws(() => transform('x.mjs', 'export default 1;\n'), /unsupported export/);
});

test('the in-page store runs the same rules as the server', async () => {
  const store = new MemoryStore();
  const { request } = await store.create({ title: 'Badge reader access', type: 'access', department: 'IT', requester: 'Owen', system: 'Door control' });
  await store.act(request.id, 'start_review', { actor: 'Ines' });
  await assert.rejects(store.act(request.id, 'reject', { actor: 'Ines', comment: '' }), /comment/);
  await store.act(request.id, 'reject', { actor: 'Ines', comment: 'Use the visitor badge process.' });
  const bundle = await store.exportBundle();
  assert.equal(validateStore(bundle).ok, true);
  assert.equal(bundle.requests.find((r) => r.id === request.id).state, 'rejected');
  await store.reset();
  assert.equal((await store.load()).requests.length, 12);
});

test('niceMax rounds the chart axis up to 1, 2 or 5 times a power of ten', () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(4), 5);
  assert.equal(niceMax(5), 5);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(13), 20);
  assert.equal(niceMax(180), 200);
});
