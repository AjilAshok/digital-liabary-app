import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { getEnv } from '../config/env.js';

/**
 * Replaceable file storage (local disk in development; object storage can implement the same
 * interface in production). Keys are generated server-side — never taken from user input.
 */
export interface FileStorage {
  put(folder: string, extension: string, data: Uint8Array): Promise<string>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-z]+\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('Storage key escapes the storage root');
    return full;
  }

  async put(folder: string, extension: string, data: Uint8Array): Promise<string> {
    const key = `${folder}/${randomUUID()}.${extension}`;
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await rm(this.pathFor(key), { force: true });
    } catch {
      // Missing or invalid keys are ignored on delete.
    }
  }
}

let storage: FileStorage | undefined;

export function getStorage(): FileStorage {
  storage ??= new LocalFileStorage(getEnv().STORAGE_DIR);
  return storage;
}

/** Test hook. */
export function setStorage(next: FileStorage): void {
  storage = next;
}
