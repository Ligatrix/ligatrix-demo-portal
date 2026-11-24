#!/usr/bin/env node
// Checks tracked source files for trailing whitespace, tab characters and a
// missing final newline. Exits non-zero and lists every problem found.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHECKED = new Set(['.mjs', '.js', '.ts', '.json', '.md', '.html', '.css', '.yml', '.yaml']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'coverage']);
const root = process.cwd();

function trackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const files = out.split('\0').filter(Boolean);
    if (files.length > 0) return files;
  } catch {
    // Not a git checkout: fall back to walking the tree.
  }
  return walk(root).map((file) => relative(root, file));
}

function walk(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}

export function lintText(text) {
  const problems = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (/[ \t]+\r?$/.test(line)) problems.push({ line: index + 1, message: 'trailing whitespace' });
    if (line.includes('\t')) problems.push({ line: index + 1, message: 'tab character' });
  });
  if (text.length > 0 && !text.endsWith('\n')) problems.push({ line: lines.length, message: 'missing final newline' });
  return problems;
}

function main() {
  const files = trackedFiles().filter((file) => CHECKED.has(extname(file)));
  let count = 0;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue; // deleted in the working tree
    }
    for (const problem of lintText(text)) {
      count += 1;
      console.error(`${file}:${problem.line}: ${problem.message}`);
    }
  }
  if (count > 0) {
    console.error(`\n${count} problem(s) in ${files.length} file(s).`);
    process.exit(1);
  }
  console.log(`lint: ${files.length} file(s) clean.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
