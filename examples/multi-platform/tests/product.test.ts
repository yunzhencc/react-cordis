import type { Favorite, FavoritesRepository } from '@examples/multi-platform-favorites';
import type { PluginModule, PluginRegistry } from '@react-cordis/boot';
import { resolve } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import * as favorites from '@examples/multi-platform-favorites';
import * as favoritesControls from '@examples/multi-platform-favorites-controls';
import * as favoritesRepository from '@examples/multi-platform-favorites-repository';
import * as favoritesView from '@examples/multi-platform-favorites-view';
import { bootProduct } from '@examples/multi-platform-shared';
import { provideStorage } from '@examples/multi-platform-storage';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import { flattenWebBootEntries } from '@react-cordis/boot/manifest';
import * as i18n from '@react-cordis/i18n';
import * as renderer from '@react-cordis/renderer/react';
import { beforeEach, expect, it, vi } from 'vitest';

const view = vi.hoisted(() => ({ apply: vi.fn<(ctx: Context) => void>() }));
vi.mock('@examples/multi-platform-favorites-view', () => ({
  default: undefined,
  __esModule: false,
  name: 'favorites-view',
  Config: undefined,
  inject: ['slots', 'favorites'],
  apply: (ctx: Context) => view.apply(ctx),
}));
beforeEach(() => {
  view.apply.mockReset();
});

function configuration(storage: PluginModule, enabled = true) {
  const graph = loadWebBootGraph(resolve(import.meta.dirname, '../apps/web/cordis.yml'), undefined, {
    bundles: ['@examples/multi-platform-product'],
    patches: ['cordis.patch.yml'],
  });
  const shell = {
    inject: ['slots', 'favoritesControls'],
    apply(ctx: Context) {
      ctx.slots.register({ name: 'root', children: { 'favorites.content': { kind: 'single', scope: 'root' } } }, () => null);
    },
  };
  const registry: PluginRegistry = new Map<string, () => Promise<PluginModule>>([
    ['@react-cordis/renderer/react', async () => renderer],
    ['@examples/multi-platform-i18n', async () => i18n],
    ['@examples/multi-platform-browser-storage', async () => storage],
    ['@examples/multi-platform-favorites-controls', async () => favoritesControls],
    ['@examples/multi-platform-favorites-repository', async () => favoritesRepository],
    ['@examples/multi-platform-favorites', async () => favorites],
    ['@examples/multi-platform-favorites-view', async () => favoritesView],
    ['@examples/multi-platform-product-shell', async () => shell],
  ]);
  flattenWebBootEntries(graph.entries).find(entry => entry.id === 'favorites')!.disabled = !enabled;
  return { graph, registry };
}

it('drains accepted writes on unload, rejects stale commands, and reloads durable data in isolated contexts', async () => {
  let saved: readonly Favorite[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const repository: FavoritesRepository = {
    load: async () => saved,
    save: async (items) => {
      await gate;
      saved = items;
    },
    close: async () => {},
  };
  const ctx = new Context();
  ctx.provide('favoritesRepository', { open: () => repository });
  const fiber = ctx.plugin(favorites);
  await fiber.await();
  const service = ctx.favorites;
  const write = service.add({ title: 'Cordis', url: 'https://github.com/cordiverse/cordis' });
  let disposed = false;
  const stop = Promise.resolve(fiber.dispose()).then(() => {
    disposed = true;
  });
  await Promise.resolve();
  expect(disposed).toBe(false);
  release();
  await Promise.all([write, stop]);
  await expect(service.add({ title: 'stale', url: 'https://example.com' })).rejects.toThrow('inactive');
  const restarted = ctx.plugin(favorites);
  await restarted.await();
  expect(ctx.favorites.getSnapshot()).toEqual(saved);
  expect(saved).toHaveLength(1);
  const other = new Context();
  other.provide('favoritesRepository', { open: () => ({ load: async () => [], save: async () => {}, close: async () => {} }) });
  await other.plugin(favorites).await();
  expect(other.favorites.getSnapshot()).toEqual([]);
  await Promise.all([ctx.fiber.dispose(), other.fiber.dispose()]);
});

it('keeps the last durable state after a write error and validates persisted input', async () => {
  const ctx = new Context();
  ctx.provide('favoritesRepository', { open: () => ({ load: async () => [], close: async () => {}, save: async () => {
    throw new Error('disk full');
  } }) });
  await ctx.plugin(favorites).await();
  await expect(ctx.favorites.add({ title: 'Example', url: 'https://example.com' })).rejects.toThrow('disk full');
  expect(ctx.favorites.getSnapshot()).toEqual([]);
  expect(() => favorites.parseFavorites('[{"title":"bad","url":"javascript:alert(1)"}]')).toThrow();
  await ctx.fiber.dispose();
});

it('owns the feature view, serializes toggles, and lets Cordis recover service dependencies', async () => {
  let storageScope!: Context;
  let saved: string | null = '[{"title":"Existing","url":"https://example.com/old"}]';
  const storage = {
    apply(ctx: Context) {
      storageScope = ctx;
      provideStorage(ctx, {
        read: async () => saved,
        write: async (_name, value) => { saved = value; },
      });
    },
  };
  let views = 0;
  view.apply.mockImplementation((ctx) => {
    views++;
    ctx.effect(() => () => {
      views--;
    });
    ctx.slots.register({ name: 'favorites.content' }, () => null);
  });
  const product = await bootProduct(configuration(storage));
  try {
    expect(views).toBe(1);
    expect(product.ctx.favorites.getSnapshot()).toEqual([{ title: 'Existing', url: 'https://example.com/old' }]);
    expect(() => product.ctx.storage.open('favorites')).toThrow();
    await product.ctx.favorites.add({ title: 'Example', url: 'https://example.com/' });
    await product.favoritesControls.setEnabled(false);
    expect(views).toBe(0);
    expect(product.ctx.slots.entries('favorites.content')).toHaveLength(0);
    const document = product.ctx.storage.open('favorites');
    expect(await document.read()).toBe(saved);
    await document.close();
    await Promise.all([product.favoritesControls.setEnabled(true), product.favoritesControls.setEnabled(false), product.favoritesControls.setEnabled(true)]);
    expect(views).toBe(1);
    expect(product.ctx.favorites.getSnapshot()).toEqual(JSON.parse(saved!));
    await storageScope.fiber.dispose();
    await vi.waitFor(() => expect(views).toBe(0));
    await product.ctx.plugin(storage).await();
    await product.ctx.loader.await();
    await vi.waitFor(() => expect(views).toBe(1));
    expect(product.ctx.slots.entries('favorites.content')).toHaveLength(1);
    await product.favoritesControls.setEnabled(false);
    await storageScope.fiber.dispose();
    await product.ctx.plugin(storage).await();
    expect(product.favoritesControls.getSnapshot()).toBe(false);
    expect(views).toBe(0);
  }
  finally {
    await product.dispose();
  }
  expect(views).toBe(0);
});

it.each(['disable', 'loader', 'close'] as const)('%s drains queued business commands before closing their repository', async (operation) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saved: string | null = null;
  let closed = false;
  const storage = {
    apply(ctx: Context) {
      provideStorage(ctx, {
        read: async () => saved,
        write: async (_name, value) => {
          await gate;
          saved = value;
        },
        close: async () => { closed = true; },
      });
    },
  };
  const product = await bootProduct(configuration(storage));
  const first = product.ctx.favorites.add({ title: 'First', url: 'https://example.com/1' });
  const second = product.ctx.favorites.add({ title: 'Second', url: 'https://example.com/2' });
  const stop = operation === 'close'
    ? product.dispose()
    : operation === 'loader'
      ? product.ctx.loader.update('favorites', { disabled: true })
      : product.favoritesControls.setEnabled(false);
  let stopped = false;
  void stop.then(() => {
    stopped = true;
  });
  await vi.waitFor(() => expect(product.ctx.favorites).toBeUndefined());
  expect(stopped).toBe(false);
  expect(closed).toBe(false);
  release();
  await Promise.all([first, second, stop]);
  expect(JSON.parse(saved!)).toHaveLength(2);
  expect(closed).toBe(operation === 'close');
  await product.dispose();
});

it('starts disabled from boot config and loads the feature only when enabled', async () => {
  const read = vi.fn(async () => null);
  const product = await bootProduct(configuration({
    apply(ctx) { provideStorage(ctx, { read, write: async () => {} }); },
  }, false));
  try {
    expect(product.favoritesControls.getSnapshot()).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(view.apply).not.toHaveBeenCalled();
    await product.favoritesControls.setEnabled(true);
    expect(product.favoritesControls.getSnapshot()).toBe(true);
    expect(read).toHaveBeenCalledOnce();
    expect(view.apply).toHaveBeenCalledOnce();
  }
  finally {
    await product.dispose();
  }
  await expect(product.favoritesControls.setEnabled(false)).rejects.toThrow('关闭');
});

it('reads toggle state from Loader and preserves a separately disabled child across group toggles', async () => {
  const product = await bootProduct(configuration({
    apply(ctx) { provideStorage(ctx, { read: async () => null, write: async () => {} }); },
  }));
  try {
    const changed = vi.fn();
    const unsubscribe = product.favoritesControls.subscribe(changed);
    const loader = product.ctx.loader;
    const repository = product.ctx.favoritesRepository;
    expect(loader.resolve('favorites-business').parent.ctx.fiber.entry?.id).toBe('favorites');
    await loader.update('favorites-view', { disabled: true });
    await loader.update('favorites', { disabled: true });
    expect(product.favoritesControls.getSnapshot()).toBe(false);
    expect(() => repository.open()).toThrow('inactive');
    expect(changed).toHaveBeenCalled();
    expect(product.ctx.i18n).toBeDefined();
    await product.favoritesControls.setEnabled(true);
    expect(loader.resolve('favorites').options.disabled).toBe(false);
    expect(loader.resolve('favorites-view').disabled).toBe(true);
    expect(product.ctx.favorites).toBeDefined();
    expect(view.apply).toHaveBeenCalledOnce();
    unsubscribe();
  }
  finally {
    await product.dispose();
  }
});

it('rolls back a failed group enable and can retry after the stored data is repaired', async () => {
  let saved = 'invalid JSON';
  const product = await bootProduct(configuration({
    apply(ctx) { provideStorage(ctx, { read: async () => saved, write: async () => {} }); },
  }, false));
  try {
    await expect(product.favoritesControls.setEnabled(true)).rejects.toThrow();
    expect(product.favoritesControls.getSnapshot()).toBe(false);
    expect(product.ctx.favorites).toBeUndefined();
    expect(view.apply).not.toHaveBeenCalled();
    const document = product.ctx.storage.open('favorites');
    await document.close();
    saved = '[]';
    await product.favoritesControls.setEnabled(true);
    expect(product.favoritesControls.getSnapshot()).toBe(true);
    expect(product.ctx.favorites.getSnapshot()).toEqual([]);
    expect(view.apply).toHaveBeenCalledOnce();
  }
  finally {
    await product.dispose();
  }
});

it('rejects enabling a group with missing service dependencies and restores its disabled state', async () => {
  const config = configuration({
    apply(ctx) { provideStorage(ctx, { read: async () => null, write: async () => {} }); },
  }, false);
  const registry = new Map(config.registry);
  registry.set('@examples/multi-platform-favorites-repository', async () => ({ apply() {} }));
  const product = await bootProduct({ ...config, registry });
  try {
    await expect(product.favoritesControls.setEnabled(true)).rejects.toThrow('未就绪');
    expect(product.favoritesControls.getSnapshot()).toBe(false);
    expect(view.apply).not.toHaveBeenCalled();
  }
  finally {
    await product.dispose();
  }
});

it('waits for asynchronous providers and rolls back a failed initial feature', async () => {
  const close = vi.fn(async () => {});
  await expect(bootProduct(configuration({
    async apply(ctx) {
      await new Promise(resolve => setTimeout(resolve, 10));
      provideStorage(ctx, { read: async () => 'invalid JSON', write: async () => {}, close });
    },
  }))).rejects.toThrow();
  expect(close).toHaveBeenCalledOnce();
  expect(view.apply).not.toHaveBeenCalled();
});
