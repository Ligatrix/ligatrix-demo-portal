#!/usr/bin/env node
// Writes dist/portal.js: the browser app and the domain modules it imports,
// as one classic script for opening index.html straight from disk (browsers
// refuse ES module imports over file://). Served over http, the modules in
// src/ are used directly and this file is not loaded.
//
// Each module becomes a function scope; named imports become destructuring
// from the module it came from, so names never clash. Supported syntax is
// deliberately narrow (the rules below), and anything else fails loudly.
//   import { a, b as c } from './x.mjs';
//   export function / async function / class / const / let NAME
//   export { a, b };

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ENTRY = 'src/ui/app.mjs';
export const OUTPUT = 'dist/portal.js';

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const ANY_IMPORT_RE = /^import\s/m;
const EXPORT_DECL_RE = /^export\s+(?:async\s+)?(function\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

function parseSpecifiers(list) {
  return list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [imported, local = imported] = part.split(/\s+as\s+/).map((name) => name.trim());
      return { imported, local };
    });
}

export function transform(file, source) {
  const imports = [];
  let body = source.replace(IMPORT_RE, (_, list, from) => {
    imports.push({ from, specifiers: parseSpecifiers(list) });
    return '';
  });
  if (ANY_IMPORT_RE.test(body)) throw new Error(`${file}: unsupported import form (use named imports on one line)`);

  const exported = [];
  body = body.replace(EXPORT_DECL_RE, (match, kind, name) => {
    exported.push(name);
    return match.replace(/^export\s+/, '');
  });
  body = body.replace(EXPORT_LIST_RE, (_, list) => {
    for (const { imported, local } of parseSpecifiers(list)) exported.push(local === imported ? imported : `${local}: ${imported}`);
    return '';
  });
  if (/^export\s/m.test(body)) throw new Error(`${file}: unsupported export form`);
  return { imports, body, exported };
}

/** Build the bundle text for `entry` (a path relative to the repository root). */
export function buildBundle(entry = ENTRY) {
  const order = [];
  const modules = new Map();

  const visit = (file, trail = []) => {
    if (modules.has(file)) return;
    if (trail.includes(file)) throw new Error(`Import cycle: ${[...trail, file].join(' -> ')}`);
    const parsed = transform(file, readFileSync(join(ROOT, file), 'utf8'));
    parsed.imports = parsed.imports.map((item) => {
      if (!item.from.startsWith('.')) throw new Error(`${file}: only relative imports can be bundled (${item.from})`);
      return { ...item, file: relative(ROOT, resolve(ROOT, dirname(file), item.from)).split('\\').join('/') };
    });
    for (const item of parsed.imports) visit(item.file, [...trail, file]);
    modules.set(file, parsed);
    order.push(file);
  };
  visit(entry);

  const chunks = order.map((file) => {
    const { imports, body, exported } = modules.get(file);
    const bindings = imports
      .map(({ file: from, specifiers }) => {
        const names = specifiers.map(({ imported, local }) => (imported === local ? imported : `${imported}: ${local}`));
        return `  const { ${names.join(', ')} } = modules[${JSON.stringify(from)}];\n`;
      })
      .join('');
    // Bodies are copied verbatim (not re-indented) so multi-line strings keep their content.
    return `modules[${JSON.stringify(file)}] = (() => {\n${bindings}${body.trim()}\nreturn { ${exported.join(', ')} };\n})();\n`;
  });

  return [
    '// This file is written by scripts/bundle.mjs from the modules in src/. Do not edit it by hand:',
    '// change the modules and run `npm run bundle`. It is only used when index.html is opened from disk.',
    '(() => {',
    "'use strict';",
    'const modules = {};',
    chunks.join('\n').trimEnd(),
    '})();',
    '',
  ].join('\n');
}

function main() {
  const output = join(ROOT, OUTPUT);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, buildBundle());
  console.log(`Wrote ${OUTPUT}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
