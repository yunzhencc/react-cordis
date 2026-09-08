import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { expect, it } from 'vitest';
import { apply, createStorageBridge } from './storage';

it('keeps existing files, isolates documents, and restricts the renderer to allowed names and text', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cordis-storage-'));
  const ctx = new Context();
  const existing = '[{"title":"Existing","url":"https://example.com/old"}]';
  await writeFile(join(directory, 'favorites.json'), existing);
  const fiber = ctx.plugin({ apply }, { directory });
  await fiber.await();
  try {
    const bridge = createStorageBridge(ctx.storage, ['favorites', 'notes']);
    expect(await bridge.read('favorites')).toBe(existing);
    expect(await bridge.read('notes')).toBeNull();
    await bridge.write('notes', 'a note');
    await bridge.write('favorites', '[]');
    expect(await bridge.read('notes')).toBe('a note');
    expect(await readFile(join(directory, 'favorites.json'), 'utf8')).toBe('[]');
    for (const name of ['../secret', 'a/b', 'con', 'credentials'])
      await expect(bridge.write(name, 'bad')).rejects.toThrow();
    await expect(bridge.write('favorites', 1 as unknown as string)).rejects.toThrow();
    await expect(bridge.write('favorites', 'x'.repeat(4 * 1024 * 1024 + 1))).rejects.toThrow();
    expect(await bridge.read('favorites')).toBe('[]');
    await fiber.dispose();
    await expect(bridge.read('favorites')).rejects.toThrow();
    await ctx.plugin({ apply }, { directory }).await();
    expect(await ctx.storage.open('notes').read()).toBe('a note');
  }
  finally {
    await ctx.fiber.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
