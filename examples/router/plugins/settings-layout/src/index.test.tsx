// @vitest-environment jsdom

import type { Context as CordisContext } from '@deepseek-ai/cordis';
import { Context } from '@deepseek-ai/cordis';
import * as appLayout from '@examples/router-app-layout';
import { apply as applyI18n } from '@yunzhen/cordis-ui-i18n';
import { apply as applyLayout, inject as layoutInject } from '@yunzhen/cordis-ui-layout';
import { apply as applyRenderer, inject as rendererInject } from '@yunzhen/cordis-ui-renderer';
import { apply as applyRouter } from '@yunzhen/cordis-ui-router';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { apply } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const Null = () => null;

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] });
});

async function bootSettings(path: string) {
  window.history.replaceState({}, '', path);
  const ctx = new Context();
  const fibers: ReturnType<CordisContext['plugin']>[] = [];
  for (const module of [
    { apply: applyI18n },
    { inject: rendererInject, apply: applyRenderer },
    { inject: layoutInject, apply: applyLayout },
    { inject: ['layout', 'slots'], apply: applyRouter },
    appLayout,
    {
      inject: ['routes'],
      apply(pluginCtx: Context) {
        pluginCtx.routes.inject('app-layout', () => pluginCtx.routes.register({
          id: 'dashboard',
          parentId: 'app-layout',
          index: true,
          Component: () => <h1>Dashboard</h1>,
          navigation: { label: 'Dashboard', order: 0 },
        }));
      },
    },
    { inject: ['routes', 'slots', 'i18n'], apply },
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

describe('settings layout', () => {
  it('replaces the app sidebar and redirects to the first sorted settings page', async () => {
    const { ctx, container, dispose } = await bootSettings('/settings');
    ctx.settings.register({
      id: 'appearance',
      group: { id: 'personal', label: 'Personal', order: 100 },
      label: 'Appearance',
      order: 100,
      Component: () => <p>Appearance content</p>,
    });
    ctx.settings.register({
      id: 'shortcuts',
      group: { id: 'coding', label: 'Coding', order: 200 },
      label: 'Keyboard shortcuts',
      order: 10,
      Component: Null,
    });
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });

    expect(container.querySelector('[data-settings-sidebar]')).not.toBeNull();
    expect(container.textContent).toContain('返回应用');
    expect(container.textContent).not.toContain('Return to app');
    expect([...container.querySelectorAll('[data-settings-menu] a')].map(link => link.textContent)).toEqual([
      'Appearance',
      'Keyboard shortcuts',
    ]);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('Appearance');
    expect(container.textContent).toContain('Appearance content');

    await act(async () => unmount());
    await dispose();
  });
});
