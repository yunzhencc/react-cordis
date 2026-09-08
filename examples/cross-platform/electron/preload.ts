import type { StorageBackend } from '../src/storage';
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('productStorage', {
  read: name => ipcRenderer.invoke('storage:read', name),
  write: (name, value) => ipcRenderer.invoke('storage:write', name, value),
} satisfies StorageBackend);

export interface DesktopLifecycle {
  onShutdown: (callback: () => void) => void;
  closed: () => void;
}

contextBridge.exposeInMainWorld('desktopLifecycle', {
  onShutdown(callback) {
    ipcRenderer.once('product:shutdown', () => callback());
    ipcRenderer.send('product:ready');
  },
  closed: () => ipcRenderer.send('product:closed'),
} satisfies DesktopLifecycle);
