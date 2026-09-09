import type {} from '@examples/multi-platform-favorites-controls';
import type { PluginRegistry, WebBootGraph } from '@react-cordis/boot';
import { Context } from '@deepseek-ai/cordis';
import { activateWebBootGraph } from '@react-cordis/boot';

export async function bootProduct({ graph, registry }: { graph: WebBootGraph; registry: PluginRegistry }) {
  const ctx = new Context();
  let closing: Promise<void> | undefined;
  const dispose = () => {
    closing ??= (async () => {
      // Drain feature commands before unloading the platform storage provider.
      try {
        await ctx.favoritesControls?.dispose();
      }
      finally {
        await ctx.fiber.dispose();
      }
    })();
    return closing;
  };
  try {
    await activateWebBootGraph(ctx, graph, registry);
    if (!ctx.favoritesControls || !ctx.slots)
      throw new Error('启动配置缺少收藏控制或插槽服务');
    await ctx.favoritesControls.ready();
    return { ctx, favoritesControls: ctx.favoritesControls, owner: ctx.slots.createRootOwner(), dispose };
  }
  catch (error) {
    await dispose();
    throw error;
  }
}

export type Product = Awaited<ReturnType<typeof bootProduct>>;
