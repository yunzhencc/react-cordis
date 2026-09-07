/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the runnable layout example under examples/layout', () => {
  expect(existsSync(new URL('../examples/layout/cordis.yml', import.meta.url))).toBe(true);
});

it.each(['app-layout', 'dashboard', 'settings-general', 'settings-appearance', 'settings-language', 'settings-layout'])('keeps the %s plugin with the layout example', (plugin) => {
  expect(existsSync(new URL(`../examples/layout/plugins/${plugin}/package.json`, import.meta.url))).toBe(true);
  expect(existsSync(new URL(`../packages/feature/${plugin}/package.json`, import.meta.url))).toBe(false);
});

it('does not keep the layout settings layout in the UI package layer', () => {
  expect(existsSync(new URL('../packages/ui/settings-layout/package.json', import.meta.url))).toBe(false);
});

it('names layout packages in the @examples namespace', () => {
  const names = [
    '../examples/layout/package.json',
    '../examples/layout/plugins/app-layout/package.json',
    '../examples/layout/plugins/dashboard/package.json',
    '../examples/layout/plugins/settings-general/package.json',
    '../examples/layout/plugins/settings-appearance/package.json',
    '../examples/layout/plugins/settings-language/package.json',
    '../examples/layout/plugins/settings-layout/package.json',
  ].map(path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).name);

  expect(names).toEqual([
    '@examples/layout',
    '@examples/layout-app-layout',
    '@examples/layout-dashboard',
    '@examples/layout-settings-general',
    '@examples/layout-settings-appearance',
    '@examples/layout-settings-language',
    '@examples/layout-settings-layout',
  ]);
});
