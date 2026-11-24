#!/usr/bin/env node
// Starts the portal: static files for the browser app plus the JSON API,
// with a JSON file as the store. Configuration is by environment variable;
// see docs/runbook.md.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStore } from './src/server/file-store.mjs';
import { createPortalServer } from './src/server/app.mjs';
import { buildSeedStore } from './src/domain/seed.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '127.0.0.1';
const dataFile = resolve(root, process.env.DATA_FILE ?? 'data/store.json');
const allowReset = process.env.ALLOW_RESET !== '0';

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be a number between 0 and 65535 (got "${process.env.PORT}").`);
  process.exit(1);
}

const store = new FileStore(dataFile, { seed: buildSeedStore });
try {
  const { created } = await store.open();
  console.log(created ? `Created ${dataFile} with demo data.` : `Loaded ${dataFile}.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const server = createPortalServer({ store, root, seed: buildSeedStore, allowReset });
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set PORT to another value.` : error.message);
  process.exit(1);
});
server.listen(port, host, () => {
  const address = server.address();
  const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`Corvane operations portal running at http://${shown}:${address.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
