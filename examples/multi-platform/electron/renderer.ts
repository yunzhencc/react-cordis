import type { DesktopLifecycle } from './preload';
import * as config from 'virtual:cordis-desktop';
import { mount } from '../web/mount';

declare global {
  interface Window {
    desktopLifecycle: DesktopLifecycle;
  }
}

const boot = mount(config, 'Electron');

window.desktopLifecycle.onShutdown(() => {
  void boot.then(dispose => dispose()).finally(() => window.desktopLifecycle.closed());
});
