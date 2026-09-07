/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the runnable router example under examples/router', () => {
  expect(existsSync(new URL('../examples/router/cordis.yml', import.meta.url))).toBe(true);
});

it.each(['app-layout', 'dashboard', 'settings-general', 'settings-appearance', 'settings-language', 'settings-layout'])('keeps the %s plugin with the router example', (plugin) => {
  expect(existsSync(new URL(`../examples/router/plugins/${plugin}/package.json`, import.meta.url))).toBe(true);
  expect(existsSync(new URL(`../packages/${plugin}/package.json`, import.meta.url))).toBe(false);
});

it('does not keep the router example settings layout in the shared package layer', () => {
  expect(existsSync(new URL('../packages/settings-layout/package.json', import.meta.url))).toBe(false);
});

it('names router packages in the @examples namespace', () => {
  const names = [
    '../examples/router/package.json',
    '../examples/router/plugins/app-layout/package.json',
    '../examples/router/plugins/dashboard/package.json',
    '../examples/router/plugins/settings-general/package.json',
    '../examples/router/plugins/settings-appearance/package.json',
    '../examples/router/plugins/settings-language/package.json',
    '../examples/router/plugins/settings-layout/package.json',
  ].map(path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).name);

  expect(names).toEqual([
    '@examples/router',
    '@examples/router-app-layout',
    '@examples/router-dashboard',
    '@examples/router-settings-general',
    '@examples/router-settings-appearance',
    '@examples/router-settings-language',
    '@examples/router-settings-layout',
  ]);
});
