import type {} from '@examples/multi-platform-file-storage/ipc';
import { join, resolve } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { activateWebBootGraph } from '@react-cordis/boot';
import { app, BrowserWindow, dialog } from 'electron';
import { graph, registry } from 'virtual:cordis-main';

app.setPath('userData', join(app.getPath('appData'), 'cordis-cross-platform'));
const ctx = new Context();
let window: BrowserWindow | undefined;
let closing = false;
let rendererReady = false;
let shutdownRequested = false;

function finishClose() {
  if (closing)
    return;
  closing = true;
  void ctx.fiber.dispose().finally(() => app.quit());
}

function requestClose(event: { preventDefault: () => void }) {
  if (closing)
    return;
  event.preventDefault();
  if (!rendererReady || !window || window.webContents.isDestroyed()) {
    finishClose();
  }
  else if (!shutdownRequested) {
    shutdownRequested = true;
    window.webContents.send('product:shutdown');
  }
}

async function start() {
  await app.whenReady();
  ctx.provide('storageDirectory', app.getPath('userData'));

  window = new BrowserWindow({
    width: 1000,
    height: 820,
    minWidth: 380,
    title: 'Cordis 多端收藏',
    webPreferences: {
      preload: resolve(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const contents = window.webContents;
  ctx.provide('desktopHost', {
    contents,
    onReady: () => { rendererReady = true; },
    onClosed: () => {
      if (shutdownRequested)
        finishClose();
    },
  });
  await activateWebBootGraph(ctx, graph, registry);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('render-process-gone', finishClose);
  window.on('close', requestClose);
  await window.loadFile(resolve(import.meta.dirname, '../electron/index.html'));
}

// ponytail: one desktop window owns writes; multi-window editing needs a main-process command store.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
else {
  app.on('second-instance', () => {
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', requestClose);
  void start().catch((error) => {
    dialog.showErrorBox('启动失败', String(error));
    app.quit();
  });
}
