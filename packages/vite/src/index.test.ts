import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { cordisWebBoot, emitWebBootGraph, renderWebBootVirtualModule } from './index';

const graph = {
  revision: 'r1',
  entries: [{ id: 'renderer', name: '@app/renderer', inject: [] }],
};

it('maps each configured package to its client import', () => {
  const source = renderWebBootVirtualModule(graph);

  expect(source).toContain('import(\'@app/renderer/client\')');
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
    rmSync(root, { force: true, recursive: true });
  }
});
