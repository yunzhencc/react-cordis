import type { Context } from '@deepseek-ai/cordis';
import type { Storage, StorageBackend, StorageDocument } from '../src/storage';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { provideStorage, validateStorageName, validateStorageValue } from '../src/storage';

export const name = 'file-storage';

/** The host selects the directory; callers supply only validated document names. */
export function apply(ctx: Context, { directory }: { directory: string }) {
  provideStorage(ctx, {
    async read(name) {
      try {
        return await readFile(join(directory, `${name}.json`), 'utf8');
      }
      catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
          return null;
        throw error;
      }
    },
    async write(name, value) {
      const path = join(directory, `${name}.json`);
      await mkdir(directory, { recursive: true });
      await writeFile(`${path}.tmp`, value, { encoding: 'utf8', mode: 0o600 });
      await rename(`${path}.tmp`, path);
    },
  });
}

/** Narrow IPC operations; the host chooses which documents this renderer may access. */
export function createStorageBridge(storage: Storage, allowedNames: readonly string[]): StorageBackend {
  const allowed = new Set(allowedNames);
  const access = async <T>(name: string, action: (document: StorageDocument) => Promise<T>) => {
    validateStorageName(name);
    if (!allowed.has(name))
      throw new Error('不允许访问此存储');
    const document = storage.open(name);
    try {
      return await action(document);
    }
    finally {
      await document.close();
    }
  };
  return {
    read: name => access(name, document => document.read()),
    write: async (name, value) => {
      validateStorageValue(value);
      await access(name, document => document.write(value));
    },
  };
}
