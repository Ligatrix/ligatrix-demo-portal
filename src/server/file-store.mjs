// A JSON file as the system of record. Reads once at start, keeps the store
// in memory, and writes every change atomically (temp file, then rename) so a
// crash mid-write never leaves a half-written store behind. Writes are queued,
// so concurrent requests are applied one after another.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validateStore } from '../domain/export.mjs';

export class FileStore {
  #file;
  #seed;
  #store = null;
  #queue = Promise.resolve();

  /**
   * @param {string} file path of the JSON store
   * @param {{seed: () => object}} options seed used when the file does not exist yet
   */
  constructor(file, { seed }) {
    this.#file = file;
    this.#seed = seed;
  }

  get file() {
    return this.#file;
  }

  /** Load the file, or create it from the seed when it is missing. */
  async open() {
    let text;
    try {
      text = await readFile(this.#file, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.#store = this.#seed();
      await this.#write(this.#store);
      return { created: true };
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`${this.#file} is not valid JSON (${error.message}). Restore it from a backup; see docs/runbook.md.`);
    }
    const check = validateStore(data);
    if (!check.ok) {
      throw new Error(`${this.#file} failed its integrity check: ${check.errors[0]} See docs/runbook.md.`);
    }
    this.#store = data;
    return { created: false };
  }

  /** The current store. Treat it as read-only; change it through `update`. */
  get() {
    if (!this.#store) throw new Error('FileStore.open() has not been called');
    return this.#store;
  }

  /**
   * Apply `change(store) => {store, ...result}` and persist the new store.
   * Resolves with whatever `change` returned once the write has finished.
   */
  update(change) {
    const run = async () => {
      const result = change(this.get());
      await this.#write(result.store);
      this.#store = result.store;
      return result;
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => {});
    return next;
  }

  async #write(store) {
    await mkdir(dirname(this.#file), { recursive: true });
    const temp = `${this.#file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(temp, this.#file);
  }
}
