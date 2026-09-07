/// <reference types="node" />

// @vitest-environment jsdom

import type { PluginRegistry } from '@react-cordis/boot';
import { resolve } from 'node:path';
import { bootWebApp } from '@react-cordis/boot';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import * as i18n from '@react-cordis/i18n';
import * as renderer from '@react-cordis/renderer';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import * as greeting from '../plugins/greeting/src';
import * as japanese from '../plugins/locale-ja/src';
import * as page from '../plugins/page/src';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('switches isolated namespaces, falls back to English, and restores the selected language', async () => {
  localStorage.clear();
  localStorage.setItem('react-cordis:locale', 'en');
  vi.stubGlobal('navigator', { languages: ['zh-CN'], language: 'zh-CN' });
  const container = document.createElement('div');
  const graph = loadWebBootGraph(resolve(import.meta.dirname, '../cordis.yml'));
  const registry: PluginRegistry = new Map([
    ['@react-cordis/i18n', async () => i18n],
    ['@react-cordis/renderer', async () => renderer],
    ['@examples/i18n-page', async () => page],
    ['@examples/i18n-greeting', async () => greeting],
    ['@examples/i18n-locale-ja', async () => japanese],
  ]);
  let dispose: (() => Promise<void>) | undefined;

  try {
    await act(async () => {
      dispose = await bootWebApp({ container, graph, registry });
    });
    expect(container.querySelector('h1')?.textContent).toBe('国际化示例');
    expect(container.querySelector('h2')?.textContent).toBe('欢迎');
    expect([...container.querySelectorAll('option')].map(option => option.value)).toEqual(['zh', 'en', 'ja']);

    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('h1')?.textContent).toBe('Internationalization example');
    expect(container.querySelector('h2')?.textContent).toBe('Welcome');

    await act(async () => {
      select.value = 'ja';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('h1')?.textContent).toBe('国際化のサンプル');
    expect(container.querySelector('h2')?.textContent).toBe('ようこそ');
    expect(container.textContent).toContain('This message falls back to English when its translation is missing.');
    expect(document.documentElement.lang).toBe('ja');
    expect(localStorage.getItem('examples:i18n:locale')).toBe('ja');
    expect(localStorage.getItem('react-cordis:locale')).toBe('en');

    await act(async () => {
      await dispose?.();
      dispose = await bootWebApp({ container, graph, registry });
    });
    expect(container.querySelector('select')?.value).toBe('ja');
    expect(container.querySelector('h2')?.textContent).toBe('ようこそ');
  }
  finally {
    await act(async () => dispose?.());
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
