import type { WebBootEntry, WebBootGraph } from '@react-cordis/boot/manifest';
import type { Plugin, Rolldown, ViteDevServer } from 'vite';
import { realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { clearInterval, setInterval } from 'node:timers';
import { fileURLToPath } from 'node:url';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import { flattenWebBootEntries } from '@react-cordis/boot/manifest';

const { isOfficialLoaderPath, removeEagerLoaderEvaluator } = createRequire(import.meta.url)('./loader-browser-source.cjs') as {
  isOfficialLoaderPath: (id: string) => boolean;
  removeEagerLoaderEvaluator: (source: string) => string;
};

export interface CordisWebBootOptions {
  configPath?: string;
  virtualModuleId?: string;
  manifestFileName?: string;
  bundles?: readonly string[];
  patches?: readonly string[];
  target?: 'browser' | 'node';
}

function manifestStamp(file: string) {
  const stat = statSync(file, { throwIfNoEntry: false });
  return stat && `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
}

export function renderWebBootVirtualModule(graph: WebBootGraph, isAvailable: (name: string) => boolean = () => false) {
  const disabledIds = new Set<string>();
  const markDisabled = (entries: readonly WebBootEntry[], disabled = false) => {
    for (const entry of entries) {
      const entryDisabled = disabled || !!entry.disabled;
      if (entryDisabled)
        disabledIds.add(entry.id);
      if (entry.group && Array.isArray(entry.config))
        markDisabled(entry.config as readonly WebBootEntry[], entryDisabled);
    }
  };
  markDisabled(graph.entries);
  const modules = [...new Set(flattenWebBootEntries(graph.entries)
    .filter(entry => !entry.group
      && !entry.name.startsWith('cordis:')
      && (!disabledIds.has(entry.id) || isAvailable(entry.name)))
    .map(entry => entry.name))];
  const loaders = modules.map((name, index) => `const load${index} = () => import(${JSON.stringify(name)});`).join('\n');
  const registry = modules.map((name, index) => `  [${JSON.stringify(name)}, load${index}],`).join('\n');
  return `${loaders}\nexport const graph = ${JSON.stringify(graph)};\nexport const registry = new Map([\n${registry}\n]);\n`;
}

export function emitWebBootGraph(bundle: Pick<Rolldown.PluginContext, 'emitFile'>, graph: WebBootGraph, fileName = 'cordis.boot.json') {
  bundle.emitFile({ fileName, source: JSON.stringify(graph, null, 2), type: 'asset' });
}

export function cordisWebBoot({
  configPath = 'cordis.yml',
  virtualModuleId = 'virtual:cordis-boot',
  manifestFileName = 'cordis.boot.json',
  bundles,
  patches,
  target = 'browser',
}: CordisWebBootOptions = {}) {
  let resolvedConfigPath = resolve(configPath);
  const resolvedVirtualModuleId = `\0${virtualModuleId}`;
  let graph: WebBootGraph | undefined;
  let server: ViteDevServer | undefined;
  let poll: NodeJS.Timeout | undefined;
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
    }, { bundles, patches });
    // Keep prior watches on failure, including newly discovered invalid files.
    for (const file of manifests.keys()) {
      if (!next.has(file))
        manifests.delete(file);
    }
    return graph;
  };
  const renderGraph = () => renderWebBootVirtualModule(loadGraph(), (name) => {
    try {
      createRequire(resolvedConfigPath).resolve(name);
      return true;
    }
    catch {
      return false;
    }
  });

  return {
    name: 'cordis-web-boot',
    config() {
      return {
        ...(target === 'browser'
          ? {
              resolve: {
                alias: [{
                  find: /^node:module$/,
                  replacement: fileURLToPath(new URL('./node-module-stub.ts', import.meta.url)),
                }],
              },
              define: {
                'process.versions.node': JSON.stringify('0.0.0'),
                'process.execArgv': '[]',
                'process.env.CORDIS_SHARED': 'undefined',
              },
            }
          : {}),
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
                  return { code: renderGraph(), moduleType: 'js' };
              },
              transform(code, id) {
                if (target === 'browser' && isOfficialLoaderPath(id))
                  return removeEagerLoaderEvaluator(code);
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
      // React Native also declares these globals; this plugin always runs in Node.
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
      }, 500) as unknown as NodeJS.Timeout;
      poll.unref();
    },
    generateBundle() {
      emitWebBootGraph(this, loadGraph(), manifestFileName);
    },
    transform(code, id) {
      if (target === 'browser' && isOfficialLoaderPath(id))
        return removeEagerLoaderEvaluator(code);
    },
    load(id) {
      if (id === resolvedVirtualModuleId)
        return renderGraph();
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
