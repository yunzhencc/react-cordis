// @vitest-environment jsdom
import type { Favorite, Favorites } from '@examples/multi-platform-favorites';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FavoritesView } from '../src/plugins/favorites-view';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('skips unchanged list work on parent updates while retaining data and local state updates', async () => {
  // Reading titles measures the real list mapping, without instrumenting React.
  const readTitle = vi.fn((index: number) => `Article ${index}`);
  const items: readonly Favorite[] = Array.from({ length: 100 }, (_, index) => ({
    get title() { return readTitle(index); },
    url: `https://example.com/${index}`,
  }));
  let finishRemove!: () => void;
  const pendingRemove = new Promise<void>((resolve) => {
    finishRemove = resolve;
  });
  const service: Favorites = {
    getSnapshot: () => items,
    subscribe: () => () => {},
    add: async () => {},
    remove: async () => pendingRemove,
  };
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<FavoritesView items={items} service={service} />));
    expect(container.querySelectorAll('li')).toHaveLength(100);
    expect(readTitle).toHaveBeenCalled();
    readTitle.mockClear();

    await act(async () => root.render(<FavoritesView items={items} service={service} />));
    expect(readTitle.mock.calls.length).toBe(0);

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label]')!.click());
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    expect(container.textContent).toContain('保存中…');
    finishRemove();
    await act(async () => pendingRemove);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);

    const updated = [...items, { title: 'New article', url: 'https://example.com/new' }];
    await act(async () => root.render(<FavoritesView items={updated} service={service} />));
    expect(container.querySelectorAll('li')).toHaveLength(101);
    expect(container.textContent).toContain('New article');

    await act(async () => root.render(<FavoritesView items={updated} />));
    expect(container.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
  }
  finally {
    finishRemove();
    await act(async () => root.unmount());
  }
});
