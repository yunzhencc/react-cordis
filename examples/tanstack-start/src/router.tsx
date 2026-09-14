import type { PluginSnapshot } from './runtime';
import { createRouter } from '@tanstack/react-router';
import { graph, registry } from 'virtual:cordis-boot';
import { routeTree } from './routeTree.gen';
import { createPluginHost } from './runtime';

export function getRouter() {
  const plugins = createPluginHost({ graph, registry });
  const router = createRouter({
    routeTree,
    context: { plugins },
    scrollRestoration: true,
    dehydrate: () => ({ plugins: plugins.get().snapshot() }),
    hydrate: async (data: { plugins: PluginSnapshot }) => { await plugins.start(data.plugins); },
  });
  // Start owns the response stream and calls this for completion/error/abort.
  router.serverSsrLifecycle = {
    onServerSsrAttach: [ssr => ssr.onCleanup(() => { void plugins.dispose().catch(console.error); })],
  };
  if (import.meta.hot && !import.meta.env.SSR)
    import.meta.hot.dispose(() => { void plugins.dispose().catch(console.error); });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
