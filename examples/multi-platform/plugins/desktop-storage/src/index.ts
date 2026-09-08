import type { Context } from '@deepseek-ai/cordis';
import type { StorageBackend } from '@examples/multi-platform-storage';
import { provideStorage } from '@examples/multi-platform-storage';

declare global {
  interface Window {
    productStorage: StorageBackend;
  }
}

export const name = 'desktop-storage';

export function apply(ctx: Context) {
  provideStorage(ctx, window.productStorage);
}
