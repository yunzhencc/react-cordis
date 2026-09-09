import type { Context } from '@deepseek-ai/cordis';
import type {} from '@examples/multi-platform-storage';
import { FavoritesError, parseFavorites, validateFavorites } from '@examples/multi-platform-favorites';

export const name = 'favorites-repository';
export const inject = ['storage'];

export function apply(ctx: Context) {
  const storage = ctx.storage;
  let live = true;
  ctx.effect(() => () => {
    live = false;
  });
  ctx.provide('favoritesRepository', {
    open() {
      if (!live)
        throw new FavoritesError('inactive');
      const document = storage.open('favorites');
      return {
        load: async () => parseFavorites(await document.read()),
        save: items => document.write(JSON.stringify(validateFavorites(items))),
        close: () => document.close(),
      };
    },
  });
}
