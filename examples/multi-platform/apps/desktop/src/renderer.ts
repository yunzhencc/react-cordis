import type { DesktopLifecycle } from './preload';
import { mount } from '@examples/multi-platform-shared/dom';
import * as config from 'virtual:cordis-desktop';

declare global {
  interface Window {
    desktopLifecycle: DesktopLifecycle;
  }
}

const boot = mount(config, 'Electron');

window.desktopLifecycle.onShutdown(() => {
  void boot.then(dispose => dispose()).finally(() => window.desktopLifecycle.closed());
});
