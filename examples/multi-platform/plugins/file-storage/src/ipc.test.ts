import type { WebContents } from 'electron';
import { Context } from '@deepseek-ai/cordis';
import { provideStorage } from '@examples/multi-platform-storage';
import { expect, it, vi } from 'vitest';
import * as storageIpc from './ipc';

const ipc = vi.hoisted(() => ({
  listeners: new Map<string, (event: unknown) => void>(),
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    on: (name: string, callback: (event: unknown) => void) => ipc.listeners.set(name, callback),
    removeListener: (name: string) => ipc.listeners.delete(name),
    handle: (name: string, callback: (event: unknown, ...args: unknown[]) => Promise<unknown>) => ipc.handlers.set(name, callback),
    removeHandler: (name: string) => ipc.handlers.delete(name),
  },
}));

it('authorizes the host main frame and removes IPC handlers when the plugin stops', async () => {
  const ctx = new Context();
  let saved: string | null = null;
  provideStorage(ctx, {
    read: async () => saved,
    write: async (_name, value) => { saved = value; },
  });
  const contents = { mainFrame: {} } as WebContents;
  const onReady = vi.fn();
  const onClosed = vi.fn();
  ctx.provide('desktopHost', { contents, onReady, onClosed });
  const fiber = ctx.plugin(storageIpc, { allowedNames: ['favorites'] });
  await fiber.await();
  try {
    const event = { sender: contents, senderFrame: contents.mainFrame };
    for (const forbidden of [{ ...event, sender: {} }, { ...event, senderFrame: {} }]) {
      expect(() => ipc.listeners.get('product:ready')!(forbidden)).toThrow('来源');
      expect(() => ipc.listeners.get('product:closed')!(forbidden)).toThrow('来源');
      expect(() => ipc.handlers.get('storage:read')!(forbidden, 'favorites')).toThrow('来源');
      expect(() => ipc.handlers.get('storage:write')!(forbidden, 'favorites', 'bad')).toThrow('来源');
    }
    expect(onReady).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
    expect(saved).toBeNull();
    ipc.listeners.get('product:ready')!(event);
    await ipc.handlers.get('storage:write')!(event, 'favorites', 'saved');
    expect(await ipc.handlers.get('storage:read')!(event, 'favorites')).toBe('saved');
    await expect(ipc.handlers.get('storage:read')!(event, 'credentials')).rejects.toThrow('不允许');
    ipc.listeners.get('product:closed')!(event);
    expect(onReady).toHaveBeenCalledOnce();
    expect(onClosed).toHaveBeenCalledOnce();
    await fiber.dispose();
    expect(ipc.handlers.size).toBe(0);
    expect(ipc.listeners.size).toBe(0);
  }
  finally {
    await ctx.fiber.dispose();
  }
});
