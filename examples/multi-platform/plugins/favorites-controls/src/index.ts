import type { Context, FiberState } from '@deepseek-ai/cordis';
import type { Entry } from '@deepseek-ai/cordis-plugin-loader';

export interface FavoritesControls {
  ready: () => Promise<void>;
  dispose: () => Promise<void>;
  getSnapshot: () => boolean;
  subscribe: (listener: () => void) => () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    favoritesControls: FavoritesControls;
  }
}

export const name = 'favorites-controls';
export const inject = ['loader'];

// Cordis declares FiberState as a const enum; it has no runtime export.
const ACTIVE = 2 satisfies FiberState;

export function apply(ctx: Context, { group }: { group: string }) {
  if (typeof group !== 'string' || !group)
    throw new TypeError('favorites-controls.group 必须为分组 ID');
  const loader = ctx.loader;
  const listeners = new Set<() => void>();
  let stopped = false;
  let pending = Promise.resolve();
  let closing: Promise<void> | undefined;

  const target = () => {
    const entry = loader.resolve(group);
    if (!entry.options.group)
      throw new Error(`插件 ${group} 不是分组`);
    return entry;
  };
  const assertReady = (entry: Entry) => {
    if (entry.disabled)
      return;
    if (entry.fiber?.state !== ACTIVE)
      throw new Error(`插件 ${entry.id} 未就绪，请检查依赖服务`);
    for (const child of entry.subgroup?.data ?? [])
      assertReady(loader.resolve(child.id));
  };
  const notify = () => listeners.forEach(listener => listener());
  ctx.on('loader/partial-dispose', (entry) => {
    if (entry.id === group)
      notify();
  });

  const controls: FavoritesControls = {
    getSnapshot: () => !target().options.disabled,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async ready() {
      await loader.await();
      assertReady(target());
    },
    setEnabled(next) {
      const task = pending.then(async () => {
        if (stopped)
          throw new Error('应用已关闭');
        if (typeof next !== 'boolean')
          throw new TypeError('功能开关必须为布尔值');
        const enabled = controls.getSnapshot();
        if (enabled === next)
          return;
        try {
          await loader.update(group, { disabled: !next });
          await controls.ready();
        }
        catch (error) {
          await loader.update(group, { disabled: !enabled });
          throw error;
        }
      });
      pending = task.catch(() => {});
      return task;
    },
    dispose() {
      stopped = true;
      closing ??= (async () => {
        await pending;
        // The host stops the configured feature before closing platform storage.
        if (ctx.fiber.uid !== null) {
          await loader.update(group, { disabled: true });
          await loader.await();
        }
      })();
      return closing;
    },
  };
  ctx.effect(() => async () => {
    stopped = true;
    await pending;
    listeners.clear();
  });
  ctx.provide('favoritesControls', controls);
}
