import type { PluginModule } from '@react-cordis/boot';
import { resolve } from 'node:path';
import * as favorites from '@examples/multi-platform-favorites';
import * as controls from '@examples/multi-platform-favorites-controls';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import * as renderer from '@react-cordis/renderer/react';
import { Slot, SlotOwner } from '@react-cordis/renderer/react';
import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import * as view from '../src/plugins/favorites-view';
import { createPluginHost } from '../src/runtime';

const graph = loadWebBootGraph(resolve(import.meta.dirname, '../cordis.yml'));
const registry = new Map<string, () => Promise<PluginModule>>([
  ['@react-cordis/renderer/react', async () => renderer],
  ['@examples/multi-platform-favorites-controls', async () => controls],
  ['@examples/multi-platform-favorites', async () => favorites],
  ['@examples/tanstack-start/view', async () => view],
]);
const configuration = { graph, registry };
const alice = { items: [{ title: 'Alice private', url: 'https://example.com/alice' }], enabled: true };
const bob = { items: [{ title: 'Bob private', url: 'https://example.com/bob' }], enabled: true };

it('isolates concurrent requests and restores the SSR snapshot without sharing live services', async () => {
  const first = createPluginHost(configuration);
  const second = createPluginHost(configuration);
  const client = createPluginHost(configuration);
  let stale: favorites.Favorites | undefined;
  try {
    await Promise.all([first.start(alice), second.start(bob)]);
    const html = renderToString(<SlotOwner owner={first.get().owner}><Slot name="root" /></SlotOwner>);
    expect(html).toContain('Alice private');
    expect(html).not.toContain('Bob private');
    await client.start(JSON.parse(JSON.stringify(first.get().snapshot())));
    expect(renderToString(<SlotOwner owner={client.get().owner}><Slot name="root" /></SlotOwner>)).toBe(html);
    await client.get().ctx.favorites.add({ title: 'Client added', url: 'https://example.com/new' });
    expect(client.get().snapshot().items).toHaveLength(2);
    expect(first.get().snapshot().items).toHaveLength(1);
    expect(second.get().snapshot().items[0]?.title).toBe('Bob private');
    await client.get().ctx.favoritesControls.setEnabled(false);
    expect(client.get().ctx.slots.entries('root')).toHaveLength(0);
    await client.get().ctx.favoritesControls.setEnabled(true);
    expect(client.get().ctx.slots.entries('root')).toHaveLength(1);
    expect(client.get().snapshot().items).toHaveLength(2);
    stale = client.get().ctx.favorites;
  }
  finally {
    await Promise.all([first.dispose(), second.dispose(), client.dispose()]);
  }
  await expect(stale!.add({ title: 'Late', url: 'https://example.com/late' })).rejects.toThrow('inactive');
});

it('restores a disabled feature and rejects malformed hydration data', async () => {
  const host = createPluginHost(configuration);
  try {
    await host.start({ ...alice, enabled: false });
    expect(host.get().ctx.favorites).toBeUndefined();
    expect(host.get().ctx.slots.entries('root')).toHaveLength(0);
    await host.get().ctx.favoritesControls.setEnabled(true);
    expect(host.get().ctx.favorites.getSnapshot()).toEqual(alice.items);
  }
  finally {
    await host.dispose();
  }
  const invalid = createPluginHost(configuration);
  await expect(invalid.start({ enabled: true, items: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] })).rejects.toThrow();
  await invalid.dispose();
});

it('closes a host during plugin import and rejects restarting the disposed host', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed = new Map(registry);
  delayed.set('@examples/tanstack-start/view', async () => {
    await gate;
    return view;
  });
  const host = createPluginHost({ graph, registry: delayed });
  const starting = host.start(alice);
  const closing = host.dispose();
  release();
  await starting;
  const runtime = host.get();
  await closing;
  expect(runtime.ctx.slots).toBeUndefined();
  await expect(host.start(bob)).rejects.toThrow();
  await host.dispose();
});
