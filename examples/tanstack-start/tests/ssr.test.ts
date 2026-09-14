import type { Favorites } from '@examples/multi-platform-favorites';
import type { PluginHost } from '../src/runtime';
import { resolve } from 'node:path';
import { cordisWebBoot } from '@react-cordis/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { createServer, isRunnableDevEnvironment } from 'vite';
import { expect, it } from 'vitest';

it('disposes the request plugins when a real Start SSR stream finishes or its request aborts', async () => {
  const server = await createServer({
    root: resolve(import.meta.dirname, '..'),
    configFile: false,
    plugins: [cordisWebBoot({ target: 'auto' }), tanstackStart(), react()],
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
  });
  try {
    const environment = server.environments.ssr!;
    if (!isRunnableDevEnvironment(environment))
      throw new Error('Expected a runnable SSR environment');
    const { createStartHandler, defaultStreamHandler } = await environment.runner.import<typeof import('@tanstack/react-start/server')>('@tanstack/react-start/server');
    for (const abort of [false, true]) {
      let host: PluginHost | undefined;
      let service: Favorites | undefined;
      const handler = createStartHandler((context) => {
        host = context.router.options.context.plugins;
        service = host!.get().ctx.favorites;
        return defaultStreamHandler(context);
      });
      const controller = new AbortController();
      const response = await handler(new Request('http://localhost/', { signal: controller.signal }));
      expect(response.status).toBe(200);
      expect(service?.getSnapshot()).toHaveLength(2);
      expect(host!.get().ctx.favorites).toBe(service);
      if (abort)
        controller.abort();
      else
        expect(await response.text()).toContain('React 官方文档');
      await expect.poll(() => host!.get().ctx.favorites).toBeUndefined();
      await expect(service!.add({ title: 'Late', url: 'https://example.com/late' })).rejects.toThrow('inactive');
    }
  }
  finally {
    await server.close();
  }
}, 20_000);
