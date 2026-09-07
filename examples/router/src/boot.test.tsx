/// <reference types="node" />

// @vitest-environment jsdom

import type { PluginRegistry } from '@react-cordis/client-modules';
import { resolve } from 'node:path';
import { bootWebApp } from '@react-cordis/client-modules';
import { loadWebBootGraph } from '@react-cordis/host-plugin-catalog';
import { act } from 'react';
import { expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each(['/', '/settings/general'])('boots the real router plugins concurrently at %s', async (path) => {
  localStorage.clear();
  window.history.replaceState({}, '', path);
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const catalog = loadWebBootGraph(resolve(import.meta.dirname, '../cordis.yml'));
  // Consumers are scheduled first so package order cannot hide missing service dependencies.
  const graph = { ...catalog, entries: [...catalog.entries].reverse() };
  const registry: PluginRegistry = new Map([
    ['@react-cordis/ui-i18n', () => import('@react-cordis/ui-i18n')],
    ['@react-cordis/ui-renderer', () => import('@react-cordis/ui-renderer')],
    ['@react-cordis/ui-layout', () => import('@react-cordis/ui-layout')],
    ['@react-cordis/ui-router', () => import('@react-cordis/ui-router')],
    ['@react-cordis/ui-theme', () => import('@react-cordis/ui-theme')],
    ['@examples/router-app-layout', () => import('../plugins/app-layout/src')],
    ['@examples/router-dashboard', () => import('../plugins/dashboard/src')],
    ['@examples/router-settings-layout', () => import('../plugins/settings-layout/src')],
    ['@examples/router-settings-general', () => import('../plugins/settings-general/src')],
    ['@examples/router-settings-appearance', () => import('../plugins/settings-appearance/src')],
    ['@examples/router-settings-language', () => import('../plugins/settings-language/src')],
  ]);
  const container = document.createElement('div');
  let dispose: (() => Promise<void>) | undefined;

  try {
    await act(async () => {
      dispose = await bootWebApp({ container, graph, registry });
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe(path === '/' ? '仪表盘' : '常规');
    if (path === '/settings/general')
      expect(container.querySelector('[data-settings-general] select')).not.toBeNull();
  }
  finally {
    await act(async () => dispose?.());
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
