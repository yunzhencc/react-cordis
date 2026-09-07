// @vitest-environment jsdom

import type { Context as CordisContext, Plugin } from '@deepseek-ai/cordis';
import type { AssetRecord, GalleryMediaApi, Thumbnail } from '@yunzhen/gallery-formats';
import { Context } from '@deepseek-ai/cordis';
import * as appLayout from '@examples/app-layout';
import * as i18n from '@yunzhen/cordis-ui-i18n';
import * as layout from '@yunzhen/cordis-ui-layout';
import * as renderer from '@yunzhen/cordis-ui-renderer';
import * as router from '@yunzhen/cordis-ui-router';
import * as formats from '@yunzhen/gallery-formats';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as assets from './index';
import { MediaStore } from './media';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const thumbnail = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: 'image/webp',
} satisfies Thumbnail;

beforeEach(() => {
  let nextObjectUrl = 0;
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: vi.fn(() => `blob:fixture-${++nextObjectUrl}`) },
    revokeObjectURL: { configurable: true, value: vi.fn() },
  });
  vi.stubGlobal('galleryPlugin', {
    install: async () => { throw new Error('not implemented'); },
    list: async () => [],
    setEnabled: async () => [],
    uninstall: async () => [],
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('shows a root chooser when no media root is configured', async () => {
  vi.stubGlobal('galleryMedia', fixtureMediaApi([]));
  const { container, dispose } = await mountGallery([formats, assets]);

  expect(container.querySelector('[data-choose-root]')).not.toBeNull();

  await dispose();
});

it('opens the chosen asset in the route-owned workbench', async () => {
  vi.stubGlobal('galleryMedia', fixtureMediaApi([
    { id: 'bird', name: 'bird.png', extension: '.png', size: 1, modifiedAt: 1 },
  ]));
  const { container, dispose } = await mountGallery([formats, assets]);
  await act(async () => container.querySelector<HTMLButtonElement>('[data-choose-root]')?.click());
  await act(async () => container.querySelector<HTMLElement>('[data-asset-id="bird"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));

  expect(container.querySelector('[data-workbench-column] img')?.getAttribute('alt')).toBe('bird.png');

  await dispose();
});

it('closes the workbench and releases its viewer URL when replacing the media root', async () => {
  const roots: readonly AssetRecord[][] = [
    [{ id: 'bird', name: 'bird.png', extension: '.png', size: 1, modifiedAt: 1 }],
    [{ id: 'cat', name: 'cat.png', extension: '.png', size: 1, modifiedAt: 2 }],
  ];
  let rootIndex = 0;
  const mediaApi = fixtureMediaApi([]);
  mediaApi.chooseRoot = async () => roots[rootIndex++] ?? [];
  vi.stubGlobal('galleryMedia', mediaApi);
  const { container, dispose } = await mountGallery([formats, assets]);
  const chooseRoot = container.querySelector<HTMLButtonElement>('[data-choose-root]');
  await act(async () => chooseRoot?.click());
  await act(async () => container.querySelector<HTMLElement>('[data-asset-id="bird"]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  const viewerUrl = container.querySelector<HTMLImageElement>('[data-workbench-column] img')?.src;

  await act(async () => chooseRoot?.click());

  expect(container.querySelector('[data-workbench-column]')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(viewerUrl);
  expect(container.querySelector('[data-asset-id="cat"]')).not.toBeNull();

  await dispose();
});

it('limits thumbnail work to four assets at a time', async () => {
  const ctx = new Context();
  const formatsFiber = ctx.plugin(formats);
  await formatsFiber.await();
  let active = 0;
  let maxActive = 0;
  const unregister = ctx.formats.register({
    id: 'delayed',
    version: '1',
    extensions: ['.png'],
    async createThumbnail() {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return thumbnail;
    },
    Viewer: () => null,
  });
  const records = Array.from({ length: 9 }, (_, index) => ({
    id: `asset-${index}`,
    name: `asset-${index}.png`,
    extension: '.png',
    size: 1,
    modifiedAt: index,
  }));
  const mediaApi = fixtureMediaApi(records, { cacheMisses: new Set(records.map(record => record.id)) });
  const media = new MediaStore(ctx.formats, mediaApi);

  await media.chooseRoot();

  expect(maxActive).toBe(4);
  media.dispose();
  unregister();
  await formatsFiber.dispose();
});

it('releases native suffixes when the assets plugin is disposed and can reload', async () => {
  vi.stubGlobal('galleryMedia', fixtureMediaApi([]));
  const app = await mountGallery([formats, assets]);
  const assetsFiber = app.fibers.at(-1)!;
  try {
    expect(app.ctx.formats.find('.png')?.id).toBe('native');

    await act(async () => assetsFiber.dispose());

    expect(app.ctx.formats.find('.png')).toBeUndefined();
    let reloaded!: ReturnType<Context['plugin']>;
    await act(async () => {
      reloaded = app.ctx.plugin(assets);
      await reloaded.await();
    });
    expect(app.ctx.formats.find('.webp')?.id).toBe('native');
    await act(async () => reloaded.dispose());
  }
  finally {
    await app.dispose();
  }
});

it('uses native button and keyboard behavior to select and open an asset', async () => {
  vi.stubGlobal('galleryMedia', fixtureMediaApi([
    { id: 'bird', name: 'bird.png', extension: '.png', size: 1, modifiedAt: 1 },
    { id: 'cat', name: 'cat.png', extension: '.png', size: 1, modifiedAt: 2 },
  ]));
  const { container, dispose } = await mountGallery([formats, assets]);
  await act(async () => container.querySelector<HTMLButtonElement>('[data-choose-root]')?.click());
  const card = container.querySelector<HTMLButtonElement>('[data-asset-id="bird"]')!;
  const otherCard = container.querySelector<HTMLButtonElement>('[data-asset-id="cat"]')!;

  expect(card.tagName).toBe('BUTTON');
  expect(card.title).toBe('bird.png');
  expect(card.querySelector('img')?.alt).toBe('bird.png');
  await act(async () => otherCard.click());
  expect(otherCard.dataset.selected).toBe('true');
  card.focus();
  expect(document.activeElement).toBe(card);
  await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' })));
  expect(card.dataset.selected).toBe('true');
  await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
  expect(container.querySelector('[data-workbench-column] img')?.getAttribute('alt')).toBe('bird.png');

  await dispose();
});

it('keeps unsupported files out of the grid', async () => {
  vi.stubGlobal('galleryMedia', fixtureMediaApi([
    { id: 'notes', name: 'notes.txt', extension: '.txt', size: 1, modifiedAt: 2 },
    { id: 'bird', name: 'bird.png', extension: '.png', size: 1, modifiedAt: 1 },
  ]));
  const { container, dispose } = await mountGallery([formats, assets]);
  await act(async () => container.querySelector<HTMLButtonElement>('[data-choose-root]')?.click());

  expect(container.querySelector('[data-asset-id="notes"]')).toBeNull();
  expect(container.querySelector('[data-asset-id="bird"]')).not.toBeNull();

  await dispose();
});

it('keeps other cards visible when one asset preview fails', async () => {
  const records: AssetRecord[] = [
    { id: 'broken', name: 'broken.png', extension: '.png', size: 1, modifiedAt: 2 },
    { id: 'bird', name: 'bird.png', extension: '.png', size: 1, modifiedAt: 1 },
  ];
  vi.stubGlobal('galleryMedia', fixtureMediaApi(records, { failedReads: new Set(['broken']) }));
  const { container, dispose } = await mountGallery([formats, assets]);
  await act(async () => container.querySelector<HTMLButtonElement>('[data-choose-root]')?.click());

  const failedCard = container.querySelector('[data-asset-id="broken"]');
  expect(failedCard?.textContent).toContain('broken.png');
  expect(failedCard?.textContent).toContain('预览失败');
  expect(container.querySelector('[data-asset-id="bird"]')).not.toBeNull();

  await dispose();
});

it('restores the collapsed sidebar state', async () => {
  localStorage.setItem('gallery.sidebar-open', 'false');
  vi.stubGlobal('galleryMedia', fixtureMediaApi([]));
  const { container, dispose } = await mountGallery([formats, assets]);

  expect(container.querySelector('[data-sidebar-column]')).toBeNull();
  expect(container.querySelector<HTMLButtonElement>('[data-sidebar-toggle][aria-label="展开左侧栏"]')).not.toBeNull();

  await dispose();
});

function fixtureMediaApi(records: readonly AssetRecord[], options: { cacheMisses?: ReadonlySet<string>; failedReads?: ReadonlySet<string> } = {}): GalleryMediaApi {
  return {
    chooseRoot: async () => records,
    listAssets: async () => [],
    readAsset: async (id) => {
      if (options.failedReads?.has(id))
        throw new Error(`cannot read ${id}`);
      return new Uint8Array([4, 5, 6]);
    },
    readThumbnail: async (id, processor) => options.cacheMisses?.has(id) || options.failedReads?.has(id) || processor !== 'native@1' ? undefined : thumbnail,
    writeThumbnail: async () => {},
  };
}

async function mountGallery(modules: readonly Plugin.Object<unknown>[]) {
  window.history.replaceState({}, '', '/');
  const ctx = new Context();
  const fibers: ReturnType<CordisContext['plugin']>[] = [];
  for (const module of [i18n, renderer, router, layout, appLayout, ...modules]) {
    const fiber = ctx.plugin(module);
    fibers.push(fiber);
    await fiber.await();
  }
  const container = document.createElement('div');
  document.body.append(container);
  let unmount!: () => void;
  await act(async () => {
    unmount = ctx.uiRenderer.mount(container);
  });
  return {
    container,
    ctx,
    fibers,
    async dispose() {
      await act(async () => unmount());
      for (const fiber of fibers.reverse()) await fiber.dispose();
      container.remove();
    },
  };
}
