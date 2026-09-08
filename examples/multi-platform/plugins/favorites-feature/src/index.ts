import type { Context, Fiber } from '@deepseek-ai/cordis';
import type { ProductControls } from '@examples/multi-platform-product-shell';
import * as favorites from '@examples/multi-platform-favorites';
import * as favoritesRepository from '@examples/multi-platform-favorites-repository';
import * as favoritesView from '@examples/multi-platform-favorites-view';

export const name = 'favorites-feature';

async function ready(fiber: Fiber) {
  await fiber.await();
  if (fiber.uid === null || fiber.store === undefined)
    throw new Error(`插件 ${fiber.name} 未就绪，请检查依赖服务`);
}

const bundle = {
  name: 'favorites-bundle',
  inject: ['storage', 'slots'],
  async apply(ctx: Context) {
    const children: Fiber[] = [];
    // Keep the view, business queue and repository under one sequential disposer.
    ctx.effect(function* () {
      for (const plugin of [favoritesRepository, favorites, favoritesView]) {
        const child = ctx.plugin(plugin);
        children.push(child);
        yield child.dispose;
      }
    });
    for (const child of children)
      await ready(child);
  },
};

export function apply(ctx: Context, { enabled: initialEnabled = true }: { enabled?: boolean } = {}) {
  if (typeof initialEnabled !== 'boolean')
    throw new TypeError('favorites-feature.enabled 必须为布尔值');
  const listeners = new Set<() => void>();
  let enabled = initialEnabled;
  let stopped = false;
  let feature: Fiber | undefined;
  let pending = Promise.resolve();
  let closing: Promise<void> | undefined;

  const controls: ProductControls = {
    getSnapshot: () => enabled,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async ready() {
      if (feature)
        await ready(feature);
    },
    setEnabled(next) {
      const task = pending.then(async () => {
        if (stopped)
          throw new Error('应用已关闭');
        if (enabled === next)
          return;
        if (next) {
          feature = ctx.plugin(bundle);
          try {
            await ready(feature);
          }
          catch (error) {
            await feature.dispose();
            feature = undefined;
            throw error;
          }
        }
        else {
          await feature?.dispose();
          feature = undefined;
        }
        enabled = next;
        listeners.forEach(listener => listener());
      });
      pending = task.catch(() => {});
      return task;
    },
    dispose() {
      stopped = true;
      closing ??= (async () => {
        await pending;
        await feature?.dispose();
        listeners.clear();
      })();
      return closing;
    },
  };
  ctx.effect(() => () => controls.dispose());
  ctx.provide('product', controls);
  // Activation of the full boot graph settles the platform provider first.
  // The host then awaits product.ready() before mounting React.
  if (enabled)
    feature = ctx.plugin(bundle);
}
