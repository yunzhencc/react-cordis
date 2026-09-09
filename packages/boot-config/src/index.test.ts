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
  expect(loadWebBootGraph(configPath).entries).toEqual([{ id: 'plugin', name: 'plugin', dependencies: [] }]);
});

it.each([undefined, null, { './client': './index.ts' }, { '.': null }, { '.': { types: './index.d.ts' } }])('rejects packages without a runtime root export: %j', (exports) => {
  const configPath = fixture('- id: plugin\n  name: plugin\n', { plugin: { exports } });
  expect(() => loadWebBootGraph(configPath)).toThrow('root export missing');
});

it('retains disabled rows without requiring their dependencies', () => {
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

  expect(loadWebBootGraph(configPath).entries.map(entry => entry.id)).toEqual(['renderer', 'dashboard']);
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
  expect(files).toEqual([configPath, manifestPath]);

  writeFileSync(manifestPath, '{');
  files.length = 0;
  expect(() => loadWebBootGraph(configPath, file => files.push(file))).toThrow();
  expect(files).toEqual([configPath, manifestPath]);
});

it.each([plugin(), plugin({})])('accepts plugins without package dependencies', (manifest) => {
  const configPath = fixture(`- id: renderer\n  name: '@fixture/renderer'\n`, {
    '@fixture/renderer': manifest,
  });

  expect(loadWebBootGraph(configPath).entries).toEqual([
    { id: 'renderer', name: '@fixture/renderer', dependencies: [] },
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

it('composes bundle patches, root entries, and app patches with official replacement and insert semantics', () => {
  const configPath = fixture('- id: root\n  name: plugin\n  config: { root: true }\n', {
    plugin: plugin(),
    bundle: { dsh: { bundle: { patch: './layer.yml' } } },
  });
  writeFileSync(join(dirname(configPath), 'node_modules/bundle/layer.yml'), `
- insert:
    - id: group
      name: cordis:group
      group: true
      isolate: { service: true }
      config: []
- id: group
  insert:
    - id: nested
      name: plugin
      config: { old: true }
- id: nested
  config: { bundle: true }
`);
  writeFileSync(join(dirname(configPath), 'app.yml'), `
- id: nested
  inject: [service]
  config: { app: true }
- id: root
  disabled: true
`);
  const files: string[] = [];
  const graph = loadWebBootGraph(configPath, path => files.push(path), { bundles: ['bundle'], patches: ['app.yml'] });
  expect(graph.entries[0]).toEqual({
    id: 'group',
    name: 'cordis:group',
    group: true,
    isolate: { service: true },
    dependencies: [],
    config: [{ id: 'nested', name: 'plugin', dependencies: [], inject: ['service'], config: { app: true } }],
  });
  expect(graph.entries[1]?.disabled).toBe(true);
  expect(files).toContain(join(dirname(configPath), 'node_modules/bundle/layer.yml'));
  expect(files).toContain(join(dirname(configPath), 'app.yml'));
});

it('rejects bundles without patch metadata', () => {
  const configPath = fixture('[]', { bundle: {} });
  expect(() => loadWebBootGraph(configPath, undefined, { bundles: ['bundle'] })).toThrow('dsh.bundle.patch');
});

it.each([
  'intercept: {}',
  'inject: false',
  'isolate: { service: false }',
  'config: { value: .nan }',
  'config: { value: !!js "process.env.SECRET" }',
  'config: { __jsExpr: "process.env.SECRET" }',
])('rejects unsupported or unsafe fields even in disabled rows: %s', (field) => {
  const configPath = fixture(`- id: disabled\n  name: missing\n  disabled: true\n  ${field}\n`, {});
  expect(() => loadWebBootGraph(configPath)).toThrow();
});

it('rejects unsafe values in patch files before applying them', () => {
  const configPath = fixture('[]', {});
  writeFileSync(join(dirname(configPath), 'app.yml'), '- id: nonexistent\n  config: !!js "1 + 1"\n');
  expect(() => loadWebBootGraph(configPath, undefined, { patches: ['app.yml'] })).toThrow('!!js');
});

it('retains unavailable disabled entries and descendants without resolving packages', () => {
  const configPath = fixture(`
- id: parent
  name: cordis:group
  group: true
  disabled: true
  config:
    - id: child
      name: unavailable
`, {});
  expect(loadWebBootGraph(configPath).entries[0]?.config).toEqual([{ id: 'child', name: 'unavailable', dependencies: [] }]);
});

it('applies bundle layers in caller order and app patches after root entries', () => {
  const configPath = fixture('- id: root\n  name: plugin/root\n', {
    plugin: { exports: { '.': './index.ts', './root': './root.ts' } },
    base: { dsh: { bundle: { patch: './layer.yml' } } },
    overlay: { dsh: { bundle: { patch: './layer.yml' } } },
  });
  writeFileSync(join(dirname(configPath), 'node_modules/base/layer.yml'), '- insert:\n    - id: bundled\n      name: plugin\n      config: { base: true }\n');
  writeFileSync(join(dirname(configPath), 'node_modules/overlay/layer.yml'), '- id: bundled\n  config: { overlay: true }\n');
  writeFileSync(join(dirname(configPath), 'app.yml'), '- id: root\n  config: { application: true }\n');
  const graph = loadWebBootGraph(configPath, undefined, { bundles: ['base', 'overlay'], patches: ['app.yml'] });
  expect(graph.entries.map(entry => entry.config)).toEqual([{ overlay: true }, { application: true }]);
});

it('resolves a disabled row when an application patch enables it', () => {
  const configPath = fixture('- id: optional\n  name: unavailable\n  disabled: true\n', {});
  writeFileSync(join(dirname(configPath), 'app.yml'), '- id: optional\n  disabled: false\n');
  expect(() => loadWebBootGraph(configPath, undefined, { patches: ['app.yml'] })).toThrow();
});

it('retains official object-form service injection without treating it as package dependencies', () => {
  const configPath = fixture('- id: plugin\n  name: plugin\n  inject: { service: { optional: true } }\n', { plugin: plugin() });
  expect(loadWebBootGraph(configPath).entries[0]).toEqual({
    id: 'plugin',
    name: 'plugin',
    dependencies: [],
    inject: { service: { optional: true } },
  });
});

it.each(['cordis:unknown', 'cordis:include'])('rejects unsupported builtin %s before package resolution', (name) => {
  const configPath = fixture(`- id: builtin\n  name: '${name}'\n`, {});
  expect(() => loadWebBootGraph(configPath)).toThrow(`unsupported builtin: ${name}`);
});
