import type { Context } from '@deepseek-ai/cordis';
import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import { ipcMain } from 'electron';
import { createStorageBridge } from './index';

export const name = 'storage-ipc';
export const inject = ['storage', 'desktopHost'];

export interface DesktopHost {
  contents: WebContents;
  onReady: () => void;
  onClosed: () => void;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopHost: DesktopHost;
  }
}

export function apply(ctx: Context, { allowedNames }: { allowedNames: readonly string[] }) {
  const { contents, onReady, onClosed } = ctx.desktopHost;
  const storage = createStorageBridge(ctx.storage, allowedNames);
  const authorize = (event: IpcMainInvokeEvent | IpcMainEvent) => {
    if (event.sender !== contents || event.senderFrame !== contents.mainFrame)
      throw new Error('不允许的存储请求来源');
  };
  ctx.effect(() => {
    const ready = (event: IpcMainEvent) => {
      authorize(event);
      onReady();
    };
    const closed = (event: IpcMainEvent) => {
      authorize(event);
      onClosed();
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
}
