// @vitest-environment jsdom

import type { Context as CordisContext } from '@deepseek-ai/cordis';
import { Context } from '@deepseek-ai/cordis';
import * as appLayout from '@examples/router-app-layout';
import { apply as applySettingsLayout } from '@examples/router-settings-layout';
import { apply as applyI18n } from '@react-cordis/ui-i18n';
import { apply as applyLayout, inject as layoutInject } from '@react-cordis/ui-layout';
import { apply as applyRenderer, inject as rendererInject } from '@react-cordis/ui-renderer';
import { apply as applyRouter } from '@react-cordis/ui-router';
import { apply as applyTheme } from '@react-cordis/ui-theme';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apply } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function bootAppearance() {
  window.history.replaceState({}, '', '/settings/appearance');
  const ctx = new Context();
  const fibers: ReturnType<CordisContext['plugin']>[] = [];
  for (const module of [
    { apply: applyI18n },
    { inject: rendererInject, apply: applyRenderer },
    { inject: layoutInject, apply: applyLayout },
    { inject: ['layout', 'slots'], apply: applyRouter },
    appLayout,
    { inject: ['routes', 'slots', 'i18n'], apply: applySettingsLayout },
    { apply: applyTheme },
    { inject: ['settings', 'theme', 'i18n'], apply },
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

describe('appearance settings extension', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] });
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.querySelector('style[data-cordis-ui-theme]')?.remove();
  });

  it('registers Appearance as a settings page while its fiber is active', async () => {
    const { ctx, container, dispose } = await bootAppearance();
    let unmount!: () => void;

    expect(ctx.settings.snapshot()).toMatchObject([{
      id: 'appearance',
      group: { id: 'personal', label: 'Personal', order: 100 },
      label: 'Appearance',
      order: 100,
    }]);

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });

    expect(container.textContent).toContain('外观');
    expect(container.textContent).toContain('系统');
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-theme-preview]')).toHaveLength(3);
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
    await act(async () => unmount());
    await dispose();
  });
});
