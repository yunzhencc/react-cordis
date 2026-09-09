import { resolve } from 'node:path';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import { flattenWebBootEntries } from '@react-cordis/boot/manifest';
import { renderWebBootVirtualModule } from '@react-cordis/vite';
import { expect, it } from 'vitest';

it.each([
  ['apps/web/cordis.yml', ['multi-platform-i18n', 'renderer/react', 'multi-platform-browser-storage', 'multi-platform-favorites-feature', 'multi-platform-product-shell']],
  ['apps/mobile/cordis.yml', ['multi-platform-i18n', 'renderer/react', 'multi-platform-native-storage', 'multi-platform-favorites-feature', 'multi-platform-product-shell']],
  ['apps/desktop/cordis.yml', ['multi-platform-i18n', 'renderer/react', 'multi-platform-desktop-storage', 'multi-platform-favorites-feature', 'multi-platform-product-shell']],
  ['apps/desktop/cordis.main.yml', ['multi-platform-file-storage', 'multi-platform-file-storage/ipc']],
])('%s includes only the host plugins and generates literal imports', (path, names) => {
  const graph = loadWebBootGraph(resolve(import.meta.dirname, '..', path), undefined, path.endsWith('cordis.main.yml')
    ? {}
    : {
        bundles: ['@examples/multi-platform-product'],
        patches: ['cordis.patch.yml'],
      });
  const entries = flattenWebBootEntries(graph.entries).filter(entry => !entry.group);
  expect(entries.map(entry => entry.name.replace(/^@[^/]+\//, '')).toSorted()).toEqual(names.toSorted());
  expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
  const code = renderWebBootVirtualModule(graph);
  for (const entry of entries)
    expect(code).toContain(`import(${JSON.stringify(entry.name)})`);
});
