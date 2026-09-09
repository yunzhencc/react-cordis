import { expect, it } from 'vitest';
import { assertWebBootGraph, flattenWebBootEntries, sortWebBootEntries } from './manifest';

it('sorts packages after their injected packages', () => {
  expect(sortWebBootEntries([
    { id: 'dashboard', name: '@app/dashboard', dependencies: ['@app/layout'] },
    { id: 'renderer', name: '@app/renderer', dependencies: [] },
    { id: 'layout', name: '@app/layout', dependencies: ['@app/renderer'] },
  ]).map(entry => entry.id)).toEqual(['renderer', 'layout', 'dashboard']);
});

it('prints the dependency path for a cycle', () => {
  expect(() => sortWebBootEntries([
    { id: 'a', name: '@app/a', dependencies: ['@app/b'] },
    { id: 'b', name: '@app/b', dependencies: ['@app/a'] },
  ])).toThrow('@app/a -> @app/b -> @app/a');
});

it.each([
  [[
    { id: 'renderer', name: '@app/renderer', dependencies: [] },
    { id: 'renderer', name: '@app/layout', dependencies: [] },
  ], /duplicate id/],
  [[
    { id: 'renderer', name: '@app/renderer', dependencies: [] },
    { id: 'layout', name: '@app/renderer', dependencies: [] },
  ], /duplicate package/],
  [[
    { id: 'dashboard', name: '@app/dashboard', dependencies: ['@app/layout'] },
  ], /injects inactive package/],
])('rejects invalid dependency graphs', (entries, error) => {
  expect(() => sortWebBootEntries(entries)).toThrow(error);
});

it('accepts nested JSON configuration', () => {
  expect(() => assertWebBootGraph({
    revision: 'test',
    entries: [{ id: 'renderer', name: '@app/renderer', dependencies: [], config: { values: [null, true, 0, 'text', { enabled: false }] } }],
  })).not.toThrow();
});

const sparseArray: number[] = [];
sparseArray.length = 1;

it.each([
  { name: 'undefined properties', config: { value: undefined } },
  { name: 'negative zero', config: { value: -0 } },
  { name: 'sparse arrays', config: { value: sparseArray } },
])('rejects configuration containing $name', ({ config }) => {
  expect(() => assertWebBootGraph({
    revision: 'test',
    entries: [{ id: 'renderer', name: '@app/renderer', dependencies: [], config: config as never }],
  })).toThrow(/config must be JSON-safe/);
});

it('preserves isolated groups and allows the same package in different groups', () => {
  const groups = ['left', 'right'].map(id => ({
    id,
    name: 'cordis:group',
    group: true,
    dependencies: [],
    isolate: { service: true as const },
    config: [{ id: `${id}-plugin`, name: 'plugin', dependencies: [], inject: ['service'] }],
  }));
  expect(sortWebBootEntries(groups)).toEqual(groups);
  expect(flattenWebBootEntries(groups).map(entry => entry.id)).toEqual(['left', 'left-plugin', 'right', 'right-plugin']);
});

it('rejects duplicate ids across groups', () => {
  const groups = ['left', 'right'].map(id => ({
    id,
    name: 'cordis:group',
    group: true,
    dependencies: [],
    config: [{ id: 'plugin', name: 'plugin', dependencies: [] }],
  }));
  expect(() => sortWebBootEntries(groups)).toThrow('duplicate id');
});

it.each([
  { config: { nested: [{ __jsExpr: 'globalThis.secret' }] } },
  { inject: { service: { nested: { __jsExpr: 'globalThis.secret' } } } },
  { isolate: { __jsExpr: 'globalThis.secret' } },
])('rejects expression markers at the direct graph boundary: %j', (fields) => {
  expect(() => assertWebBootGraph({
    revision: 'test',
    entries: [{ id: 'plugin', name: 'plugin', dependencies: [], ...fields }],
  })).toThrow('!!js expression objects');
});

it('rejects expression markers inside disabled nested group entries', () => {
  expect(() => assertWebBootGraph({
    revision: 'test',
    entries: [{
      id: 'group',
      name: 'cordis:group',
      dependencies: [],
      group: true,
      disabled: true,
      config: [{ id: 'plugin', name: 'plugin', dependencies: [], config: { __jsExpr: 'globalThis.secret' } }],
    }],
  })).toThrow('!!js expression objects');
});
