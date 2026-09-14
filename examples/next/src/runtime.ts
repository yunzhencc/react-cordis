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

export function validateSnapshot(snapshot: PluginSnapshot): PluginSnapshot {
  if (typeof snapshot?.enabled !== 'boolean')
    throw new TypeError('插件快照缺少 enabled');
  return { items: validateFavorites(snapshot.items), enabled: snapshot.enabled };
}

export async function startPlugins(snapshot: PluginSnapshot, configuration: { graph: WebBootGraph; registry: PluginRegistry }) {
  let { items } = validateSnapshot(snapshot);
  const ctx = new Context();
  let closing: Promise<void> | undefined;
  const dispose = () => closing ??= (async () => {
    try {
      await ctx.favoritesControls?.dispose();
    }
    finally {
      await ctx.fiber.dispose();
    }
  })();
  try {
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
    return { ctx, dispose, snapshot: (): PluginSnapshot => ({ items, enabled: ctx.favoritesControls.getSnapshot() }) };
  }
  catch (error) {
    await dispose();
    throw error;
  }
}

export type PluginRuntime = Awaited<ReturnType<typeof startPlugins>>;
