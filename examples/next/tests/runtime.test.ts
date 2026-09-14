import type { PluginModule } from '@react-cordis/boot';
import { resolve } from 'node:path';
import * as favorites from '@examples/multi-platform-favorites';
import * as controls from '@examples/multi-platform-favorites-controls';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import { expect, it } from 'vitest';
import { startPlugins } from '../src/runtime';

const configuration = {
  graph: loadWebBootGraph(resolve(import.meta.dirname, '../cordis.server.yml')),
  registry: new Map<string, () => Promise<PluginModule>>([
    ['@examples/multi-platform-favorites', async () => favorites],
    ['@examples/multi-platform-favorites-controls', async () => controls],
  ]),
};

it('isolates request data, restores serialized state, and invalidates disposed services', async () => {
  const alice = { items: [{ title: 'Alice', url: 'https://example.com/alice' }], enabled: true };
  const bob = { items: [{ title: 'Bob', url: 'https://example.com/bob' }], enabled: false };
  const [first, second] = await Promise.all([startPlugins(alice, configuration), startPlugins(bob, configuration)]);
  let restored;
  const stale = first.ctx.favorites;
  try {
    expect(second.ctx.favorites).toBeUndefined();
    await second.ctx.favoritesControls.setEnabled(true);
    expect(second.ctx.favorites.getSnapshot()[0]?.title).toBe('Bob');
    await first.ctx.favorites.add({ title: 'Added', url: 'https://example.com/added' });
    restored = await startPlugins(JSON.parse(JSON.stringify(first.snapshot())), configuration);
    expect(restored.ctx.favorites.getSnapshot().map((item: favorites.Favorite) => item.title)).toEqual(['Alice', 'Added']);
    expect(second.snapshot().items).toHaveLength(1);
    await first.ctx.favoritesControls.setEnabled(false);
    await first.ctx.favoritesControls.setEnabled(true);
    expect(first.snapshot().items).toHaveLength(2);
  }
  finally {
    await Promise.all([first.dispose(), second.dispose(), restored?.dispose()]);
  }
  expect(first.ctx.favorites).toBeUndefined();
  expect(second.ctx.favorites).toBeUndefined();
  expect(restored?.ctx.favorites).toBeUndefined();
  await expect(stale.add({ title: 'Late', url: 'https://example.com/late' })).rejects.toThrow('inactive');
});

it('rejects malformed snapshots before starting plugins', async () => {
  await expect(startPlugins({ enabled: true, items: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] }, configuration)).rejects.toThrow('invalidUrl');
  await expect(startPlugins({ enabled: 'yes', items: [] } as never, configuration)).rejects.toThrow('enabled');
});
