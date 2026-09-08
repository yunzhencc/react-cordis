import type { Context } from '@deepseek-ai/cordis';
import { parseFavorites, validateFavorites } from './favorites';
import './storage';

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
