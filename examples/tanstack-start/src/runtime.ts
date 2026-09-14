import type { Favorite } from '@examples/multi-platform-favorites';
import type {} from '@examples/multi-platform-favorites-controls';
import type { PluginRegistry, WebBootGraph } from '@react-cordis/boot';
import { Context } from '@deepseek-ai/cordis';
import { validateFavorites } from '@examples/multi-platform-favorites';
import { activateWebBootGraph } from '@react-cordis/boot';

export interface PluginSnapshot {
  items: readonly Favorite[];
  enabled: boolean;
}

export function createPluginHost(configuration: { graph: WebBootGraph; registry: PluginRegistry }) {
  let runtime: Awaited<ReturnType<typeof boot>> | undefined;
  let pending: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let stopped = false;

  async function boot(snapshot: PluginSnapshot) {
    if (typeof snapshot?.enabled !== 'boolean')
      throw new TypeError('插件快照缺少 enabled');
    let items = validateFavorites(snapshot.items);
    const ctx = new Context();
    const dispose = async () => {
      try {
        await ctx.favoritesControls?.dispose();
      }
      finally {
        await ctx.fiber.dispose();
      }
    };
    try {
      // Each request/client owns its repository. Only the snapshot crosses SSR.
      ctx.provide('favoritesRepository', {
        open: () => ({
          load: async () => items,
          save: async (next) => { items = next; },
          close: async () => {},
        }),
      });
      const graph = {
        ...configuration.graph,
        entries: configuration.graph.entries.map(entry => entry.id === 'favorites' ? { ...entry, disabled: !snapshot.enabled } : entry),
      };
      await activateWebBootGraph(ctx, graph, configuration.registry);
      await ctx.favoritesControls.ready();
      return {
        ctx,
        owner: ctx.slots.createRootOwner(),
        snapshot: (): PluginSnapshot => ({ items, enabled: ctx.favoritesControls.getSnapshot() }),
        dispose,
      };
    }
    catch (error) {
      await dispose();
      throw error;
    }
  }

  return {
    async start(snapshot: PluginSnapshot) {
      if (stopped)
        throw new Error('插件宿主已关闭');
      pending ??= boot(snapshot).then((value) => {
        runtime = value;
      });
      await pending;
    },
    get() {
      if (!runtime)
        throw new Error('插件尚未初始化');
      return runtime;
    },
    dispose() {
      stopped = true;
      closing ??= (async () => {
        try {
          await pending;
        }
        catch {
          // Failed startup already rolls back its Context.
          return;
        }
        await runtime?.dispose();
      })();
      return closing;
    },
  };
}

export type PluginHost = ReturnType<typeof createPluginHost>;
