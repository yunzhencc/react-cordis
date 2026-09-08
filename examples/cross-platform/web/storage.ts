import type { Context } from '@deepseek-ai/cordis';
import { provideStorage } from '../src/storage';

export const name = 'browser-storage';
export function apply(ctx: Context) {
  provideStorage(ctx, {
    read: async name => localStorage.getItem(`cordis-cross-platform:${name}`),
    write: async (name, value) => localStorage.setItem(`cordis-cross-platform:${name}`, value),
  });
}
