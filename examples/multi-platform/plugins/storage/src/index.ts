import type { Context } from '@deepseek-ai/cordis';

/** One named UTF-8 document. Closing drains accepted operations and retains its data. */
export interface StorageDocument {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  close: () => Promise<void>;
}

/** One live owner per document name; different documents can operate independently. */
export interface Storage {
  open: (name: string) => StorageDocument;
}

/** Platform I/O only. Names, values, ordering and handle lifetimes are managed above it. */
export interface StorageBackend {
  read: (name: string) => Promise<string | null>;
  write: (name: string, value: string) => Promise<void>;
  close?: () => Promise<void>;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    storage: Storage;
  }
}

/** Also used at the IPC boundary; names never contain paths or Windows device names. */
export function validateStorageName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(name)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name)) {
    throw new Error('存储名称无效');
  }
}

/** Bound transferred/stored text; business schemas belong to the consuming repository. */
export function validateStorageValue(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 4 * 1024 * 1024)
    throw new Error('存储内容必须为字符串，最多 4M 个 UTF-16 码元');
}

/** Install the same lifecycle semantics for all platform providers. */
export function provideStorage(ctx: Context, backend: StorageBackend) {
  const documents = new Map<string, StorageDocument>();
  let stopped = false;
  ctx.effect(() => async () => {
    stopped = true;
    await Promise.all([...documents.values()].map(document => document.close()));
    await backend.close?.();
  });
  ctx.provide('storage', {
    open(name) {
      validateStorageName(name);
      if (stopped || ctx.fiber.uid === null)
        throw new Error('存储插件已关闭');
      if (documents.has(name))
        throw new Error(`存储 ${name} 已打开`);
      let pending = Promise.resolve();
      let closing: Promise<void> | undefined;
      const run = <T>(operation: () => Promise<T>): Promise<T> => {
        if (closing || stopped || ctx.fiber.uid === null)
          return Promise.reject(new Error('存储句柄已关闭'));
        const task = pending.then(operation);
        pending = task.then(() => {}, () => {});
        return task;
      };
      const document: StorageDocument = {
        read: () => run(async () => {
          const value = await backend.read(name);
          if (value !== null)
            validateStorageValue(value);
          return value;
        }),
        write: value => run(async () => {
          validateStorageValue(value);
          await backend.write(name, value);
        }),
        close() {
          closing ??= pending.then(() => {
            documents.delete(name);
          });
          return closing;
        },
      };
      documents.set(name, document);
      return document;
    },
  });
}
