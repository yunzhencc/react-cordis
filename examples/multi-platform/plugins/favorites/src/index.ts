import type { Context } from '@deepseek-ai/cordis';

export interface Favorite {
  readonly title: string;
  readonly url: string;
}

/** One repository session, closed by the business owner after its accepted writes. */
export interface FavoritesRepository {
  load: () => Promise<readonly Favorite[]>;
  save: (items: readonly Favorite[]) => Promise<void>;
  close: () => Promise<void>;
}

export interface Favorites {
  getSnapshot: () => readonly Favorite[];
  subscribe: (listener: () => void) => () => void;
  add: (item: Favorite) => Promise<void>;
  remove: (url: string) => Promise<void>;
}

export class FavoritesError extends Error {
  constructor(readonly code: 'invalidData' | 'invalidItem' | 'invalidUrl' | 'inactive') {
    super(code);
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    favoritesRepository: { open: () => FavoritesRepository };
    favorites: Favorites;
  }
}

export function validateFavorites(value: unknown): readonly Favorite[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new FavoritesError('invalidData');
  const urls = new Set<string>();
  return Object.freeze(value.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('title' in item) || !('url' in item)
      || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200
      || typeof item.url !== 'string' || item.url.length > 2048) {
      throw new FavoritesError('invalidItem');
    }
    let url: URL;
    try {
      url = new URL(item.url);
    }
    catch {
      throw new FavoritesError('invalidUrl');
    }
    if (!['https:', 'http:'].includes(url.protocol) || urls.has(url.href))
      throw new FavoritesError('invalidUrl');
    urls.add(url.href);
    return Object.freeze({ title: item.title.trim(), url: url.href });
  }));
}

export function parseFavorites(text: string | null): readonly Favorite[] {
  return validateFavorites(text === null ? [] : JSON.parse(text));
}

export const name = 'favorites';
export const inject = ['favoritesRepository'];

export async function apply(ctx: Context) {
  const repository = ctx.favoritesRepository.open();
  const fiber = ctx.fiber;
  const listeners = new Set<() => void>();
  let live = true;
  let pending = Promise.resolve();
  ctx.effect(() => async () => {
    live = false;
    await pending;
    await repository.close();
    listeners.clear();
  });
  let items = validateFavorites(await repository.load());
  if (fiber.uid === null)
    return;

  const change = (update: (current: readonly Favorite[]) => readonly Favorite[]) => {
    if (!live || fiber.uid === null)
      return Promise.reject(new FavoritesError('inactive'));
    const task = pending.then(async () => {
      const next = validateFavorites(update(items));
      await repository.save(next);
      items = next;
      if (live && fiber.uid !== null)
        listeners.forEach(listener => listener());
    });
    pending = task.catch(() => {});
    return task;
  };

  ctx.provide('favorites', {
    getSnapshot: () => items,
    subscribe(listener) {
      if (!live || fiber.uid === null)
        return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add: item => change(current => [...current, item]),
    remove: url => change(current => current.filter(item => item.url !== url)),
  });
}
