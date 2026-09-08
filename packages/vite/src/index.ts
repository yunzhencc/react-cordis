import type { WebBootGraph } from '@react-cordis/boot/manifest';
import type { Plugin, Rolldown, ViteDevServer } from 'vite';
import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWebBootGraph } from '@react-cordis/boot-config';

interface CordisWebBootOptions {
  configPath?: string;
  virtualModuleId?: string;
}

function manifestStamp(file: string) {
  const stat = statSync(file, { throwIfNoEntry: false });
  return stat && `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
}

export function renderWebBootVirtualModule(graph: WebBootGraph) {
  const loaders = graph.entries.map((entry, index) => `const load${index} = () => import('${entry.name}');`).join('\n');
  const registry = graph.entries.map((entry, index) => `  ['${entry.name}', load${index}],`).join('\n');
  return `${loaders}\nexport const graph = ${JSON.stringify(graph)};\nexport const registry = new Map([\n${registry}\n]);\n`;
}

export function emitWebBootGraph(bundle: Pick<Rolldown.PluginContext, 'emitFile'>, graph: WebBootGraph) {
  bundle.emitFile({ fileName: 'cordis.boot.json', source: JSON.stringify(graph, null, 2), type: 'asset' });
}

export function cordisWebBoot({
  configPath = 'cordis.yml',
  virtualModuleId = 'virtual:cordis-boot',
}: CordisWebBootOptions = {}) {
  let resolvedConfigPath = resolve(configPath);
  const resolvedVirtualModuleId = `\0${virtualModuleId}`;
  let graph: WebBootGraph | undefined;
  let server: ViteDevServer | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  const manifests = new Map<string, string | undefined>();
  const loadGraph = () => {
    if (graph)
      return graph;
    const next = new Set<string>();
    graph = loadWebBootGraph(resolvedConfigPath, (file) => {
      // Resolve workspace symlinks; keep the known path if a file was deleted.
      try {
        file = realpathSync(file);
      }
      catch {
        file = resolve(file);
      }
      next.add(file);
      if (!server || manifests.has(file))
        return;
      // Capture before reading: an asynchronous watcher baseline could miss
      // an edit made immediately after the first graph load.
      manifests.set(file, manifestStamp(file));
    });
    // Keep prior watches on failure, including newly discovered invalid files.
    for (const file of manifests.keys()) {
      if (!next.has(file))
        manifests.delete(file);
    }
    return graph;
  };

  return {
    name: 'cordis-web-boot',
    config() {
      return {
        optimizeDeps: {
          rolldownOptions: {
            // Vite's scanner externalizes virtual IDs. Expose the boot imports
            // to it so plugin dependencies are found before the browser loads.
            plugins: [{
              name: 'cordis-web-boot-scan',
              resolveId(id) {
                if (id === virtualModuleId)
                  return resolvedVirtualModuleId;
              },
              load(id) {
                if (id === resolvedVirtualModuleId)
                  return { code: renderWebBootVirtualModule(loadGraph()), moduleType: 'js' };
              },
            }],
          },
        },
      };
    },
    configResolved(config) {
      resolvedConfigPath = resolve(config.root, configPath);
    },
    buildStart() {
      loadGraph();
    },
    configureServer(devServer) {
      server = devServer;
      graph = undefined;
      server.watcher.add(resolvedConfigPath);
      clearInterval(poll);
      poll = setInterval(() => {
        for (const [file, previous] of manifests) {
          try {
            const current = manifestStamp(file);
            if (current === previous)
              continue;
            manifests.set(file, current);
            // Vite ignores node_modules. Forward metadata changes to its HMR
            // pipeline; changing exports still requires restarting with --force.
            devServer.watcher.emit('change', file);
          }
          catch (error) {
            devServer.config.logger.error(`web boot metadata watch failed for ${file}: ${String(error)}`);
          }
        }
      }, 500);
      poll.unref();
    },
    generateBundle() {
      emitWebBootGraph(this, loadGraph());
    },
    load(id) {
      if (id === resolvedVirtualModuleId)
        return renderWebBootVirtualModule(loadGraph());
    },
    resolveId(id) {
      if (id === virtualModuleId)
        return resolvedVirtualModuleId;
    },
    handleHotUpdate({ file, server }) {
      if (resolve(file) !== resolvedConfigPath && !manifests.has(resolve(file)))
        return;
      graph = undefined;
      const module = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
      if (module)
        server.moduleGraph.invalidateModule(module);
      server.ws.send({ type: 'full-reload' });
      return [];
    },
    closeBundle() {
      clearInterval(poll);
      poll = undefined;
      manifests.clear();
      server = undefined;
      graph = undefined;
    },
  } satisfies Plugin;
}
