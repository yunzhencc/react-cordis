import type { Context } from '@deepseek-ai/cordis';
import type {} from '@examples/multi-platform-storage';
import { parseFavorites, validateFavorites } from '@examples/multi-platform-favorites';

export const name = 'favorites-repository';
export const inject = ['storage'];

export function apply(ctx: Context) {
  const document = ctx.storage.open('favorites');
  ctx.effect(() => () => document.close());
  ctx.provide('favoritesRepository', {
    load: async () => parseFavorites(await document.read()),
    save: items => document.write(JSON.stringify(validateFavorites(items))),
  });
}
