import type { Fiber, Plugin } from '@deepseek-ai/cordis';
import { Context } from '@deepseek-ai/cordis';
import * as renderer from '@react-cordis/renderer/react';
import * as favorites from './favorites';
import * as favoritesRepository from './favorites-repository';

export interface ProductControls {
  getSnapshot: () => boolean;
  subscribe: (listener: () => void) => () => void;
  setEnabled: (enabled: boolean) => Promise<void>;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    product: ProductControls;
  }
}

async function ready(fiber: Fiber) {
  await fiber.await();
  if (fiber.uid === null || fiber.store === undefined)
    throw new Error(`插件 ${fiber.name} 未就绪，请检查依赖服务`);
}

/** Product composition, not a second dependency resolver or plugin loader. */
export async function bootProduct(storage: Plugin, shell: Plugin, favoritesView: Plugin) {
  const ctx = new Context();
  const listeners = new Set<() => void>();
  let enabled = false;
  let stopped = false;
  let feature: Fiber | undefined;
  let pending = Promise.resolve();

  const bundle = {
    name: 'favorites-feature',
    async apply(scope: Context) {
      // One effect disposes its collected children in reverse order, sequentially.
      const children: Fiber[] = [];
      scope.effect(function* () {
        for (const plugin of [favoritesRepository, favorites, favoritesView]) {
          const child = scope.plugin(plugin);
          children.push(child);
          yield child.dispose;
        }
      });
      for (const child of children)
        await ready(child);
    },
  };
  const controls: ProductControls = {
    getSnapshot: () => enabled,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
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
  };

  const dispose = async () => {
    stopped = true;
    await pending;
    await feature?.dispose();
    await ctx.fiber.dispose();
    listeners.clear();
  };

  try {
    await ready(ctx.plugin(renderer));
    await ready(ctx.plugin(storage));
    ctx.provide('product', controls);
    await ready(ctx.plugin(shell));
    await controls.setEnabled(true);
    return { ctx, controls, owner: ctx.slots.createRootOwner(), dispose };
  }
  catch (error) {
    await dispose();
    throw error;
  }
}

export type Product = Awaited<ReturnType<typeof bootProduct>>;
