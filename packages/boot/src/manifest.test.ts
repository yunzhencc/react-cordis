import { expect, it } from 'vitest';
import { assertWebBootGraph, sortWebBootEntries } from './manifest';

it('sorts packages after their injected packages', () => {
  expect(sortWebBootEntries([
    { id: 'dashboard', name: '@app/dashboard', inject: ['@app/layout'] },
    { id: 'renderer', name: '@app/renderer', inject: [] },
    { id: 'layout', name: '@app/layout', inject: ['@app/renderer'] },
  ]).map(entry => entry.id)).toEqual(['renderer', 'layout', 'dashboard']);
});

it('prints the dependency path for a cycle', () => {
  expect(() => sortWebBootEntries([
    { id: 'a', name: '@app/a', inject: ['@app/b'] },
    { id: 'b', name: '@app/b', inject: ['@app/a'] },
  ])).toThrow('@app/a -> @app/b -> @app/a');
});

it.each([
  [[
    { id: 'renderer', name: '@app/renderer', inject: [] },
    { id: 'renderer', name: '@app/layout', inject: [] },
  ], /duplicate id/],
  [[
    { id: 'renderer', name: '@app/renderer', inject: [] },
    { id: 'layout', name: '@app/renderer', inject: [] },
  ], /duplicate package/],
  [[
    { id: 'dashboard', name: '@app/dashboard', inject: ['@app/layout'] },
  ], /injects inactive package/],
])('rejects invalid dependency graphs', (entries, error) => {
  expect(() => sortWebBootEntries(entries)).toThrow(error);
});

it('accepts nested JSON configuration', () => {
  expect(() => assertWebBootGraph({
    revision: 'test',
    entries: [{ id: 'renderer', name: '@app/renderer', inject: [], config: { values: [null, true, 0, 'text', { enabled: false }] } }],
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
    entries: [{ id: 'renderer', name: '@app/renderer', inject: [], config: config as never }],
  })).toThrow(/config must be JSON-safe/);
});
