import { resolve } from 'node:path';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import { renderWebBootVirtualModule } from '@react-cordis/vite';
import { expect, it } from 'vitest';

it.each([
  ['apps/web/cordis.yml', ['renderer/react', 'multi-platform-browser-storage', 'multi-platform-favorites-feature', 'multi-platform-product-shell']],
  ['apps/mobile/cordis.yml', ['renderer/react', 'multi-platform-native-storage', 'multi-platform-favorites-feature', 'multi-platform-product-shell']],
  ['apps/desktop/cordis.yml', ['renderer/react', 'multi-platform-desktop-storage', 'multi-platform-favorites-feature', 'multi-platform-product-shell']],
  ['apps/desktop/cordis.main.yml', ['multi-platform-file-storage', 'multi-platform-file-storage/ipc']],
])('%s includes only the host plugins and generates literal imports', (path, names) => {
  const graph = loadWebBootGraph(resolve(import.meta.dirname, '..', path));
  expect(graph.entries.map(entry => entry.name.replace(/^@[^/]+\//, ''))).toEqual(names);
  expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
  const code = renderWebBootVirtualModule(graph);
  for (const entry of graph.entries)
    expect(code).toContain(`import('${entry.name}')`);
});
