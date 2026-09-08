// @vitest-environment jsdom
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { expect, it, vi } from 'vitest';
import * as fileStorage from '../electron/storage';
import * as nativeStorage from '../native/storage';
import * as browserStorage from '../web/storage';
import { provideStorage } from './storage';

// Only the native SQLite binding is substituted; the adapter and lifecycle run unchanged.
const sqlite = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-sqlite/kv-store', () => ({
  SQLiteStorage: class {
    constructor(private database: string) {}
    async getItem(key: string) { return sqlite.get(`${this.database}:${key}`) ?? null; }
    async setItem(key: string, value: string) { sqlite.set(`${this.database}:${key}`, value); }
    async close() {}
  },
}));

it.each(['browser', 'native', 'file'] as const)('%s preserves named documents across handle and provider restarts', async (platform) => {
  const ctx = new Context();
  const directory = await mkdtemp(join(tmpdir(), 'cordis-storage-contract-'));
  const plugin = platform === 'browser'
    ? browserStorage
    : platform === 'native'
      ? nativeStorage
      : {
          apply: (ctx: Context) => fileStorage.apply(ctx, { directory }),
        };
  const existing = '[{"title":"Existing","url":"https://example.com/old"}]';
  localStorage.setItem('cordis-cross-platform:favorites', existing);
  sqlite.set('ExpoSQLiteStorage:cordis-cross-platform:favorites', existing);
  await writeFile(join(directory, 'favorites.json'), existing);
  const fiber = ctx.plugin(plugin);
  await fiber.await();
  try {
    expect(ctx.storage).toBeDefined();
    const storage = ctx.storage;
    for (const name of ['../secret', 'a/b', '', 'CON', 'con', 'a'.repeat(65)])
      expect(() => storage.open(name)).toThrow();
    const favorites = ctx.storage.open('favorites');
    const notes = ctx.storage.open('notes');
    expect(await favorites.read()).toBe(existing);
    expect(await notes.read()).toBeNull();
    expect(() => storage.open('favorites')).toThrow();
    await favorites.write('[{"title":"Saved","url":"https://example.com/"}]');
    await notes.write('a note');
    await favorites.close();
    await expect(favorites.write('stale')).rejects.toThrow();
    expect(await notes.read()).toBe('a note');
    const restored = ctx.storage.open('favorites');
    expect(await restored.read()).toBe('[{"title":"Saved","url":"https://example.com/"}]');
    await favorites.close();
    expect(() => storage.open('favorites')).toThrow();
    await expect(restored.write('x'.repeat(4 * 1024 * 1024 + 1))).rejects.toThrow();
    expect(await restored.read()).toBe('[{"title":"Saved","url":"https://example.com/"}]');
    await fiber.dispose();
    expect(() => storage.open('other')).toThrow();
    await expect(notes.read()).rejects.toThrow();
    await ctx.plugin(plugin).await();
    expect(await ctx.storage.open('notes').read()).toBe('a note');
  }
  finally {
    await ctx.fiber.dispose();
    localStorage.clear();
    sqlite.clear();
    await rm(directory, { recursive: true, force: true });
  }
});

it('drains accepted operations before closing the backend, and recovers after a failed write', async () => {
  const ctx = new Context();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saved: string | null = null;
  let closed = false;
  const fiber = ctx.plugin({
    apply(scope: Context) {
      provideStorage(scope, {
        read: async () => saved,
        write: async (_name, value) => {
          await gate;
          if (value === 'fail')
            throw new Error('disk full');
          saved = value;
        },
        close: async () => { closed = true; },
      });
    },
  });
  await fiber.await();
  const document = ctx.storage.open('example');
  const failure = expect(document.write('fail')).rejects.toThrow('disk full');
  const success = document.write('saved');
  const read = document.read();
  const stop = fiber.dispose();
  expect(closed).toBe(false);
  release();
  await Promise.all([failure, success, stop]);
  expect(await read).toBe('saved');
  expect(saved).toBe('saved');
  expect(closed).toBe(true);
  await ctx.fiber.dispose();
});
