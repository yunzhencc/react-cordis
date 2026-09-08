import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { expect, it, vi } from 'vitest';
import { cordisWebBoot, emitWebBootGraph, renderWebBootVirtualModule } from './index';

const graph = {
  revision: 'r1',
  entries: [{ id: 'renderer', name: '@app/renderer', inject: [] }],
};

it('maps each configured package to its root import', () => {
  const source = renderWebBootVirtualModule(graph);

  expect(source).toContain('import(\'@app/renderer\')');
  expect(source).toContain('[\'@app/renderer\', load0]');
});

it('emits the same graph as cordis.boot.json', () => {
  const output: unknown[] = [];
  emitWebBootGraph({ emitFile: (file) => {
    output.push(file);
    return 'graph';
  } }, graph);

  expect(output).toEqual([{ type: 'asset', fileName: 'cordis.boot.json', source: JSON.stringify(graph, null, 2) }]);
});

it('resolves a supplied virtual module id', () => {
  const plugin = cordisWebBoot({ virtualModuleId: 'virtual:custom-boot' });

  expect(Reflect.apply(plugin.resolveId, undefined, ['virtual:custom-boot'])).toBe('\0virtual:custom-boot');
});

it('resolves the default boot config from the consuming Vite root', () => {
  const root = mkdtempSync(join(import.meta.dirname, '.cordis-vite-plugin-'));
  writeFileSync(join(root, 'cordis.yml'), '[]');
  const plugin = cordisWebBoot();

  try {
    Reflect.apply(plugin.configResolved, undefined, [{ root }]);
    expect(Reflect.apply(plugin.load, undefined, ['\0virtual:cordis-boot'])).toContain('"entries":[]');
  }
  finally {
    rmSync(root, { force: true, recursive: true });
  }
});

it('reloads the virtual boot graph when its boot config changes', () => {
  const root = mkdtempSync(join(import.meta.dirname, '.cordis-vite-plugin-'));
  const configPath = join(root, 'cordis.yml');
  const virtualModuleId = 'virtual:cordis-test-boot';
  const resolvedVirtualModuleId = `\0${virtualModuleId}`;
  writeFileSync(configPath, '- id: i18n\n  name: \'@react-cordis/i18n\'\n');
  const plugin = cordisWebBoot({ configPath, virtualModuleId });
  const module = { id: resolvedVirtualModuleId };
  const add = vi.fn();
  const invalidateModule = vi.fn();
  const send = vi.fn();

  try {
    Reflect.apply(plugin.configureServer, undefined, [{ watcher: { add } }]);
    expect(add).toHaveBeenCalledWith(configPath);
    expect(Reflect.apply(plugin.load, undefined, [resolvedVirtualModuleId])).not.toContain('@react-cordis/renderer');
    writeFileSync(configPath, '- id: i18n\n  name: \'@react-cordis/i18n\'\n- id: renderer\n  name: \'@react-cordis/renderer\'\n');
    Reflect.apply(plugin.handleHotUpdate, undefined, [{
      file: configPath,
      server: { moduleGraph: { getModuleById: () => module, invalidateModule }, ws: { send } },
    }]);

    expect(invalidateModule).toHaveBeenCalledWith(module);
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
    expect(Reflect.apply(plugin.load, undefined, [resolvedVirtualModuleId])).toContain('@react-cordis/renderer');
  }
  finally {
    Reflect.apply(plugin.closeBundle, undefined, []);
    rmSync(root, { force: true, recursive: true });
  }
});

function metadataFixture() {
  const root = mkdtempSync(join(tmpdir(), 'cordis-metadata-'));
  const configPath = join(root, 'cordis.yml');
  const manifestPath = join(root, 'node_modules/plugin/package.json');
  mkdirSync(join(root, 'node_modules/plugin'), { recursive: true });
  const manifest = { name: 'plugin', exports: { '.': './index.ts' } };
  writeFileSync(manifestPath, JSON.stringify(manifest));
  writeFileSync(configPath, '- id: plugin\n  name: plugin\n');
  const plugin = cordisWebBoot({ configPath });
  const module = { id: '\0virtual:cordis-boot' };
  const invalidateModule = vi.fn();
  const send = vi.fn();
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn() });
  const server = { watcher, moduleGraph: { getModuleById: () => module, invalidateModule }, ws: { send } };
  watcher.on('change', file => Reflect.apply(plugin.handleHotUpdate, undefined, [{ file, server }]));
  Reflect.apply(plugin.configureServer, undefined, [server]);
  return {
    root,
    configPath,
    manifestPath,
    manifest,
    plugin,
    send,
    invalidateModule,
    load: () => Reflect.apply(plugin.load, undefined, [module.id]) as string,
    changeConfig: () => Reflect.apply(plugin.handleHotUpdate, undefined, [{ file: configPath, server }]),
    close: () => Reflect.apply(plugin.closeBundle, undefined, []),
  };
}

it('refreshes metadata under node_modules and recovers from invalid or deleted manifests', async () => {
  const app = metadataFixture();
  try {
    const initial = app.load();
    const previous = app.send.mock.calls.length;
    writeFileSync(app.manifestPath, JSON.stringify({ ...app.manifest, cordis: { inject: ['missing'] } }));
    await vi.waitFor(() => expect(app.send.mock.calls.length).toBeGreaterThan(previous), { timeout: 3000 });
    expect(app.invalidateModule).toHaveBeenCalled();
    expect(app.send).toHaveBeenLastCalledWith({ type: 'full-reload' });
    expect(() => app.load()).toThrow('injects inactive package');

    for (const content of ['{', null, JSON.stringify(app.manifest)]) {
      const before = app.send.mock.calls.length;
      if (content === null)
        rmSync(app.manifestPath);
      else
        writeFileSync(app.manifestPath, content);
      await vi.waitFor(() => expect(app.send.mock.calls.length).toBeGreaterThan(before), { timeout: 3000 });
      if (content === JSON.stringify(app.manifest))
        expect(app.load()).toBe(initial);
      else
        expect(() => app.load()).toThrow();
    }
  }
  finally {
    app.close();
    rmSync(app.root, { force: true, recursive: true });
  }
});

it('tracks newly enabled symlinked packages even when their first metadata read fails', async () => {
  const app = metadataFixture();
  const workspacePackage = join(app.root, 'workspace-plugin');
  const manifestPath = join(workspacePackage, 'package.json');
  mkdirSync(workspacePackage);
  symlinkSync(workspacePackage, join(app.root, 'node_modules/workspace-plugin'), 'dir');
  try {
    app.load();
    writeFileSync(manifestPath, '{');
    writeFileSync(app.configPath, '- id: workspace\n  name: workspace-plugin\n');
    app.changeConfig();
    expect(() => app.load()).toThrow();
    const before = app.send.mock.calls.length;
    writeFileSync(manifestPath, JSON.stringify({ ...app.manifest, name: 'workspace-plugin' }));
    await vi.waitFor(() => expect(app.send.mock.calls.length).toBeGreaterThan(before), { timeout: 3000 });
    expect(app.load()).toContain('import(\'workspace-plugin\')');

    // Removed packages and a closed development server must stop triggering reloads.
    app.send.mockClear();
    writeFileSync(app.manifestPath, '{}');
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(app.send).not.toHaveBeenCalled();
    app.close();
    writeFileSync(manifestPath, '{}');
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(app.send).not.toHaveBeenCalled();
  }
  finally {
    app.close();
    rmSync(app.root, { force: true, recursive: true });
  }
});

it('updates dependency metadata with Vite default dependency optimization enabled', async () => {
  const app = metadataFixture();
  app.close();
  writeFileSync(join(app.root, 'node_modules/plugin/index.ts'), 'export const version = 1;');
  mkdirSync(join(app.root, 'node_modules/provider'));
  writeFileSync(join(app.root, 'node_modules/provider/package.json'), JSON.stringify({ ...app.manifest, name: 'provider' }));
  writeFileSync(join(app.root, 'node_modules/provider/index.ts'), 'export const value = true;');
  writeFileSync(app.configPath, '- id: plugin\n  name: plugin\n- id: provider\n  name: provider\n');
  const server = await createServer({
    root: app.root,
    configFile: false,
    plugins: [cordisWebBoot({ configPath: app.configPath })],
    server: { middlewareMode: true, ws: false, watch: null },
    logLevel: 'silent',
  });
  try {
    await server.environments.client.pluginContainer.buildStart({});
    const before = await server.transformRequest('virtual:cordis-boot');
    expect(before?.code).toContain('/node_modules/.vite/deps/');
    expect(before?.code).toContain('"entries":[{"id":"plugin"');
    writeFileSync(app.manifestPath, JSON.stringify({ ...app.manifest, cordis: { inject: ['provider'] } }));
    await vi.waitFor(async () => {
      const after = await server.transformRequest('virtual:cordis-boot');
      expect(after?.code).toContain('"entries":[{"id":"provider"');
      expect(after?.code).toContain('"inject":["provider"]');
    }, { timeout: 3000 });

    writeFileSync(app.manifestPath, JSON.stringify(app.manifest));
    await vi.waitFor(async () => {
      const after = await server.transformRequest('virtual:cordis-boot');
      expect(after?.code).toContain('"entries":[{"id":"plugin"');
      expect(after?.code).not.toContain('"inject":["provider"]');
    }, { timeout: 3000 });
  }
  finally {
    await server.close();
    rmSync(app.root, { force: true, recursive: true });
  }
});

it('discovers dependencies behind a virtual boot module before browser requests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cordis-cold-start-'));
  mkdirSync(join(root, 'node_modules/dep'), { recursive: true });
  mkdirSync(join(root, 'workspace-plugin'));
  symlinkSync(join(root, 'workspace-plugin'), join(root, 'node_modules/plugin'), 'dir');
  writeFileSync(join(root, 'workspace-plugin/package.json'), JSON.stringify({ name: 'plugin', exports: { '.': './index.js' } }));
  writeFileSync(join(root, 'workspace-plugin/index.js'), 'export { value } from "dep";');
  writeFileSync(join(root, 'node_modules/dep/package.json'), JSON.stringify({ name: 'dep', main: './index.js' }));
  writeFileSync(join(root, 'node_modules/dep/index.js'), 'exports.value = 42;');
  writeFileSync(join(root, 'cordis.yml'), '- id: plugin\n  name: plugin\n');
  writeFileSync(join(root, 'index.html'), '<script type="module" src="/main.js"></script>');
  writeFileSync(join(root, 'main.js'), 'import { registry } from "virtual:custom-boot"; window.registry = registry;');
  const server = await createServer({
    root,
    configFile: false,
    plugins: [cordisWebBoot({ virtualModuleId: 'virtual:custom-boot' })],
    server: { middlewareMode: true, ws: false, watch: null },
    logLevel: 'silent',
  });
  try {
    const optimizer = server.environments.client.depsOptimizer!;
    await optimizer.init();
    await optimizer.scanProcessing;
    await vi.waitFor(() => expect(optimizer.metadata.optimized.dep).toBeDefined());
    expect(optimizer.metadata.optimized.plugin).toBeUndefined();
  }
  finally {
    await server.close();
    rmSync(root, { force: true, recursive: true });
  }
});
