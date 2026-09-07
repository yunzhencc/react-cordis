/// <reference types="node" />

// @vitest-environment jsdom

import type { PluginRegistry } from '@react-cordis/boot';
import { resolve } from 'node:path';
import { bootWebApp } from '@react-cordis/boot';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import { act } from 'react';
import { expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each(['/', '/settings/general'])('boots the real router plugins concurrently at %s', async (path) => {
  localStorage.clear();
  window.history.replaceState({}, '', path);
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const configuredGraph = loadWebBootGraph(resolve(import.meta.dirname, '../cordis.yml'));
  // Consumers are scheduled first so package order cannot hide missing service dependencies.
  const graph = { ...configuredGraph, entries: [...configuredGraph.entries].reverse() };
  const registry: PluginRegistry = new Map([
    ['@react-cordis/i18n', () => import('@react-cordis/i18n')],
    ['@react-cordis/renderer', () => import('@react-cordis/renderer')],
    ['@react-cordis/layout', () => import('@react-cordis/layout')],
    ['@react-cordis/router', () => import('@react-cordis/router')],
    ['@react-cordis/theme', () => import('@react-cordis/theme')],
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
