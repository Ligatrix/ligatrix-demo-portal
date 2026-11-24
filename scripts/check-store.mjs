#!/usr/bin/env node
// Checks a JSON store or handover bundle before you trust it:
//   node scripts/check-store.mjs [file]      (default: data/store.json)
// Exits 0 when the file is consistent, 1 otherwise, listing every problem.

import { readFileSync } from 'node:fs';
import { validateStore } from '../src/domain/export.mjs';

const file = process.argv[2] ?? process.env.DATA_FILE ?? 'data/store.json';

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`${file}: cannot read as JSON (${error.message})`);
  process.exit(1);
}

const { ok, errors } = validateStore(data);
if (!ok) {
  console.error(`${file}: ${errors.length} problem(s)`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
const kind = data.format ? `handover bundle exported ${data.exportedAt}` : 'store';
console.log(`${file}: OK (${kind}, schema ${data.schemaVersion}, ${data.requests.length} requests, ${data.log.length} log entries)`);
