import type { WebBootGraph } from '@react-cordis/client-modules/manifest';
import type { Plugin, Rolldown } from 'vite';
import { resolve } from 'node:path';
import { loadWebBootGraph } from '@react-cordis/host-plugin-catalog';

interface CordisWebBootOptions {
  configPath?: string;
  virtualModuleId?: string;
}

export function renderWebBootVirtualModule(graph: WebBootGraph) {
  const loaders = graph.entries.map((entry, index) => `const load${index} = () => import('${entry.name}/client');`).join('\n');
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
  const loadGraph = () => graph ??= loadWebBootGraph(resolvedConfigPath);

  return {
    name: 'cordis-web-boot',
    configResolved(config) {
      resolvedConfigPath = resolve(config.root, configPath);
    },
    buildStart() {
      loadGraph();
    },
    configureServer(server) {
      server.watcher.add(resolvedConfigPath);
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
      if (resolve(file) !== resolvedConfigPath)
        return;
      graph = undefined;
      const module = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
      if (module)
        server.moduleGraph.invalidateModule(module);
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  } satisfies Plugin;
}
