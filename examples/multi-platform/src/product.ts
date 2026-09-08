import type {} from '@examples/multi-platform-product-shell';
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
        await ctx.product?.dispose();
      }
      finally {
        await ctx.fiber.dispose();
      }
    })();
    return closing;
  };
  try {
    await activateWebBootGraph(ctx, graph, registry);
    if (!ctx.product || !ctx.slots)
      throw new Error('启动配置缺少产品或插槽服务');
    await ctx.product.ready();
    return { ctx, controls: ctx.product, owner: ctx.slots.createRootOwner(), dispose };
  }
  catch (error) {
    await dispose();
    throw error;
  }
}

export type Product = Awaited<ReturnType<typeof bootProduct>>;
