import type { Favorite, FavoritesRepository } from './favorites';
import { Context } from '@deepseek-ai/cordis';
import { expect, it, vi } from 'vitest';
import * as favorites from './favorites';
import { bootProduct } from './product';
import { provideStorage } from './storage';

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
  };
  const ctx = new Context();
  ctx.provide('favoritesRepository', repository);
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
  await expect(service.add({ title: 'stale', url: 'https://example.com' })).rejects.toThrow('停用');
  const restarted = ctx.plugin(favorites);
  await restarted.await();
  expect(ctx.favorites.getSnapshot()).toEqual(saved);
  expect(saved).toHaveLength(1);
  const other = new Context();
  other.provide('favoritesRepository', { load: async () => [], save: async () => {} });
  await other.plugin(favorites).await();
  expect(other.favorites.getSnapshot()).toEqual([]);
  await Promise.all([ctx.fiber.dispose(), other.fiber.dispose()]);
});

it('keeps the last durable state after a write error and validates persisted input', async () => {
  const ctx = new Context();
  ctx.provide('favoritesRepository', { load: async () => [], save: async () => {
    throw new Error('disk full');
  } });
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
  const shell = {
    inject: ['slots'],
    apply(ctx: Context) {
      ctx.slots.register({ name: 'root', children: { 'favorites.content': { kind: 'single', scope: 'root' } } }, () => null);
    },
  };
  let views = 0;
  const view = {
    inject: ['slots', 'favorites'],
    apply(ctx: Context) {
      views++;
      ctx.effect(() => () => {
        views--;
      });
      ctx.slots.register({ name: 'favorites.content' }, () => null);
    },
  };
  const product = await bootProduct(storage, shell, view);
  try {
    expect(views).toBe(1);
    expect(product.ctx.favorites.getSnapshot()).toEqual([{ title: 'Existing', url: 'https://example.com/old' }]);
    expect(() => product.ctx.storage.open('favorites')).toThrow();
    await product.ctx.favorites.add({ title: 'Example', url: 'https://example.com/' });
    await product.controls.setEnabled(false);
    expect(views).toBe(0);
    expect(product.ctx.slots.entries('favorites.content')).toHaveLength(0);
    const document = product.ctx.storage.open('favorites');
    expect(await document.read()).toBe(saved);
    await document.close();
    await Promise.all([product.controls.setEnabled(true), product.controls.setEnabled(false), product.controls.setEnabled(true)]);
    expect(views).toBe(1);
    expect(product.ctx.favorites.getSnapshot()).toEqual(JSON.parse(saved!));
    await storageScope.fiber.dispose();
    await vi.waitFor(() => expect(views).toBe(0));
    product.ctx.plugin(storage);
    await vi.waitFor(() => expect(views).toBe(1));
    expect(product.ctx.slots.entries('favorites.content')).toHaveLength(1);
  }
  finally {
    await product.dispose();
  }
  expect(views).toBe(0);
});

it.each(['disable', 'close'] as const)('%s drains queued business commands before closing their repository', async (operation) => {
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
  const product = await bootProduct(storage, { apply() {} }, { apply() {} });
  const first = product.ctx.favorites.add({ title: 'First', url: 'https://example.com/1' });
  const second = product.ctx.favorites.add({ title: 'Second', url: 'https://example.com/2' });
  const stop = operation === 'close' ? product.dispose() : product.controls.setEnabled(false);
  expect(closed).toBe(false);
  release();
  await Promise.all([first, second, stop]);
  expect(JSON.parse(saved!)).toHaveLength(2);
  expect(closed).toBe(operation === 'close');
  await product.dispose();
});
