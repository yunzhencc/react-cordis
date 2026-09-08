import type { Context } from '@deepseek-ai/cordis';
import type { StorageBackend } from '../src/storage';
import type { DesktopLifecycle } from './preload';
import { provideStorage } from '../src/storage';
import { mount } from '../web/mount';

declare global {
  interface Window {
    productStorage: StorageBackend;
    desktopLifecycle: DesktopLifecycle;
  }
}

const boot = mount({
  name: 'desktop-storage',
  apply(ctx: Context) {
    provideStorage(ctx, window.productStorage);
  },
}, 'Electron');

window.desktopLifecycle.onShutdown(() => {
  void boot.then(dispose => dispose()).finally(() => window.desktopLifecycle.closed());
});
