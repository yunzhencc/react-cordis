import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { loadWebBootGraph } from './index';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function fixture(config: string, packages: Record<string, object>) {
  const root = mkdtempSync(join(tmpdir(), 'cordis-boot-config-'));
  roots.push(root);
  writeFileSync(join(root, 'cordis.yml'), config);

  for (const [name, manifest] of Object.entries(packages)) {
    const directory = join(root, 'node_modules', ...name.split('/'));
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, ...manifest }));
  }

  return join(root, 'cordis.yml');
}

function plugin(metadata?: object) {
  return {
    exports: { '.': './index.ts' },
    ...(metadata === undefined ? {} : { cordis: metadata }),
  };
}

it.each([
  './index.ts',
  { '.': './index.ts' },
  { '.': { types: './index.d.ts', default: './index.ts' } },
  { types: './index.d.ts', default: './index.ts' },
])('accepts a package root export: %j', (exports) => {
  const configPath = fixture('- id: plugin\n  name: plugin\n', { plugin: { exports } });
  expect(loadWebBootGraph(configPath).entries).toEqual([{ id: 'plugin', name: 'plugin', inject: [] }]);
});

it.each([undefined, null, { './client': './index.ts' }, { '.': null }, { '.': { types: './index.d.ts' } }])('rejects packages without a runtime root export: %j', (exports) => {
  const configPath = fixture('- id: plugin\n  name: plugin\n', { plugin: { exports } });
  expect(() => loadWebBootGraph(configPath)).toThrow('root export missing');
});

it('omits disabled rows before topology validation', () => {
  const configPath = fixture(`
- id: renderer
  name: '@fixture/renderer'
- id: dashboard
  name: '@fixture/dashboard'
  disabled: true
`, {
    '@fixture/renderer': plugin(),
    '@fixture/dashboard': plugin({ inject: ['@fixture/missing'] }),
  });

  expect(loadWebBootGraph(configPath).entries.map(entry => entry.id)).toEqual(['renderer']);
});

it.each(['plugin', '@fixture/plugin'])('loads explicit subpath exports from %s without changing the import specifier', (name) => {
  const configPath = fixture(`- id: root\n  name: '${name}'\n- id: react\n  name: '${name}/react'\n`, {
    [name]: { exports: { '.': './index.ts', './react': { types: './react.d.ts', default: './react.ts' } } },
  });
  expect(loadWebBootGraph(configPath).entries.map(entry => entry.name)).toEqual([name, `${name}/react`]);
});

it.each([undefined, null, { types: './react.d.ts' }])('rejects missing or type-only subpath exports: %j', (entry) => {
  const configPath = fixture('- id: react\n  name: plugin/react\n', {
    plugin: { exports: { '.': './index.ts', './react': entry } },
  });
  expect(() => loadWebBootGraph(configPath)).toThrow('./react export missing');
});

it('sorts enabled entries by their package metadata dependencies', () => {
  const configPath = fixture(`
- id: dashboard
  name: '@fixture/dashboard'
- id: renderer
  name: '@fixture/renderer'
`, {
    '@fixture/renderer': plugin(),
    '@fixture/dashboard': plugin({ inject: ['@fixture/renderer'] }),
  });

  expect(loadWebBootGraph(configPath).entries.map(entry => entry.id)).toEqual(['renderer', 'dashboard']);
});

it('reports only enabled package manifests before parsing them so failed reads remain watchable', () => {
  const configPath = fixture(`
- id: renderer
  name: '@fixture/renderer'
- id: disabled
  name: '@fixture/disabled'
  disabled: true
`, { '@fixture/renderer': plugin() });
  const manifestPath = join(dirname(configPath), 'node_modules/@fixture/renderer/package.json');
  const files: string[] = [];
  loadWebBootGraph(configPath, file => files.push(file));
  expect(files).toEqual([manifestPath]);

  writeFileSync(manifestPath, '{');
  files.length = 0;
  expect(() => loadWebBootGraph(configPath, file => files.push(file))).toThrow();
  expect(files).toEqual([manifestPath]);
});

it.each([plugin(), plugin({})])('accepts plugins without package dependencies', (manifest) => {
  const configPath = fixture(`- id: renderer\n  name: '@fixture/renderer'\n`, {
    '@fixture/renderer': manifest,
  });

  expect(loadWebBootGraph(configPath).entries).toEqual([
    { id: 'renderer', name: '@fixture/renderer', inject: [] },
  ]);
});

it.each([null, 'web', [], { inject: null }, { inject: 'renderer' }, { inject: [42] }].map(cordis => ({ cordis })))('rejects malformed cordis metadata: $cordis', ({ cordis }) => {
  const configPath = fixture(`- id: renderer\n  name: '@fixture/renderer'\n`, {
    '@fixture/renderer': { ...plugin(), cordis },
  });

  expect(() => loadWebBootGraph(configPath)).toThrow(/cordis|inject/);
});

it.each([
  [() => fixture(`- id: missing-root\n  name: '@fixture/missing-root'\n`, { '@fixture/missing-root': {} }), /root export missing/],
  [() => fixture(`- id: dashboard\n  name: '@fixture/dashboard'\n`, { '@fixture/dashboard': plugin({ inject: ['@fixture/missing'] }) }), /injects inactive package/],
  [() => fixture(`- id: invalid\n  name: '@fixture/invalid'\n  config: !!js/function >\n    function () {}\n`, { '@fixture/invalid': plugin() }), /!!js/],
])('rejects invalid boot config input', (createFixture, error) => {
  expect(() => loadWebBootGraph(createFixture())).toThrow(error);
});
