// @vitest-environment jsdom

import type { Context as CordisContext } from '@deepseek-ai/cordis';
import { Context } from '@deepseek-ai/cordis';
import * as appLayout from '@examples/router-app-layout';
import { apply as applyGeneral, inject as generalInject } from '@examples/router-settings-general';
import { apply as applySettingsLayout } from '@examples/router-settings-layout';
import { apply as applyI18n } from '@react-cordis/i18n';
import { apply as applyLayout, inject as layoutInject } from '@react-cordis/layout';
import { apply as applyRenderer, inject as rendererInject } from '@react-cordis/renderer';
import { apply as applyRouter } from '@react-cordis/router';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { apply, inject } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] });
  window.history.replaceState({}, '', '/settings/general');
});

async function bootLanguageSettings() {
  const ctx = new Context();
  const fibers: ReturnType<CordisContext['plugin']>[] = [];
  for (const module of [
    { apply: applyI18n },
    { apply: applyRenderer, inject: rendererInject },
    { apply: applyLayout, inject: layoutInject },
    { apply: applyRouter, inject: ['layout', 'slots'] },
    appLayout,
    { apply: applySettingsLayout, inject: ['i18n', 'routes', 'slots'] },
    { apply: applyGeneral, inject: generalInject },
    { apply, inject },
  ]) {
    const fiber = ctx.plugin(module);
    fibers.push(fiber);
    await fiber.await();
  }

  return {
    ctx,
    container: document.createElement('div'),
    async dispose() {
      for (const fiber of fibers.reverse()) await fiber.dispose();
    },
  };
}

describe('language settings extension', () => {
  it('contributes Language to General instead of creating another settings menu item', async () => {
    const { container, ctx, dispose } = await bootLanguageSettings();
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });

    expect(container.querySelector('h1')?.textContent).toBe('常规');
    expect(container.querySelector('[data-settings-menu] h2')?.textContent).toBe('个人');
    expect([...container.querySelectorAll('[data-settings-menu] a')].map(link => link.textContent)).toEqual(['常规']);
    expect(container.textContent).toContain('应用 UI 语言');
    const select = container.querySelector('select')!;
    expect(select.value).toBe('zh');

    await act(async () => {
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelector('h1')?.textContent).toBe('General');
    expect(container.querySelector('[data-settings-menu] h2')?.textContent).toBe('Personal');
    expect(container.textContent).toContain('Application UI language');
    expect(container.textContent).toContain('Return to app');
    expect(select.value).toBe('en');

    let removeLanguage!: () => void;
    await act(async () => {
      removeLanguage = ctx.i18n.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' });
    });
    expect(select.querySelector('option[value="ja"]')?.textContent).toBe('日本語');
    await act(async () => removeLanguage());
    expect(select.querySelector('option[value="ja"]')).toBeNull();

    await act(async () => unmount());
    await dispose();
  });
});
