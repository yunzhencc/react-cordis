import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { join, resolve } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fileStorage from './storage';

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
  const directory = app.getPath('userData');
  const storage = ctx.plugin(fileStorage, { directory });
  await storage.await();
  if (storage.uid === null || storage.store === undefined)
    throw new Error('桌面存储未就绪');

  window = new BrowserWindow({
    width: 1000,
    height: 820,
    minWidth: 380,
    title: 'Cordis 跨端收藏',
    webPreferences: {
      preload: resolve(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const contents = window.webContents;
  const authorize = (event: IpcMainInvokeEvent | IpcMainEvent) => {
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame)
      throw new Error('不允许的存储请求来源');
  };
  const bridge = ctx.plugin({
    name: 'storage-ipc',
    inject: ['storage'],
    apply(scope: Context) {
      const storage = fileStorage.createStorageBridge(scope.storage, ['favorites']);
      scope.effect(() => {
        const ready = (event: IpcMainEvent) => {
          authorize(event);
          rendererReady = true;
        };
        const closed = (event: IpcMainEvent) => {
          authorize(event);
          if (shutdownRequested)
            finishClose();
        };
        ipcMain.on('product:ready', ready);
        ipcMain.on('product:closed', closed);
        ipcMain.handle('storage:read', (event, name: string) => {
          authorize(event);
          return storage.read(name);
        });
        ipcMain.handle('storage:write', (event, name: string, value: string) => {
          authorize(event);
          return storage.write(name, value);
        });
        return () => {
          ipcMain.removeHandler('storage:read');
          ipcMain.removeHandler('storage:write');
          ipcMain.removeListener('product:ready', ready);
          ipcMain.removeListener('product:closed', closed);
        };
      });
    },
  });
  await bridge.await();
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
