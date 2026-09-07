// @vitest-environment jsdom

import type { Context as CordisContext } from '@deepseek-ai/cordis';
import { Context } from '@deepseek-ai/cordis';
import { apply as applyModels, inject as modelsInject } from '@examples/agent-models';
import { apply as applySettingsLayout } from '@examples/agent-settings-layout';
import * as appLayout from '@examples/app-layout';
import { apply as applyI18n } from '@yunzhen/cordis-ui-i18n';
import { apply as applyLayout, inject as layoutInject } from '@yunzhen/cordis-ui-layout';
import { apply as applyRenderer, inject as rendererInject } from '@yunzhen/cordis-ui-renderer';
import { apply as applyRouter } from '@yunzhen/cordis-ui-router';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apply, inject } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const modelsConfig = {};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/settings/models');
  Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] });
});

afterEach(() => document.body.replaceChildren());

async function bootModelSettings() {
  const ctx = new Context();
  const fibers: ReturnType<CordisContext['plugin']>[] = [];
  for (const module of [
    { apply: applyI18n },
    { inject: rendererInject, apply: applyRenderer },
    { inject: layoutInject, apply: applyLayout },
    { inject: ['layout', 'slots'], apply: applyRouter },
    appLayout,
    { inject: ['routes', 'slots', 'i18n'], apply: applySettingsLayout },
    { inject: modelsInject, apply: applyModels, config: modelsConfig },
    { inject, apply },
  ]) {
    const fiber = ctx.plugin(module, 'config' in module ? module.config : undefined);
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

describe('model settings extension', () => {
  it('saves the DeepSeek API key without provider configuration controls', async () => {
    const { container, ctx, dispose } = await bootModelSettings();
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });

    expect(container.textContent).toContain('模型提供商');
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelectorAll('input')).toHaveLength(1);
    const apiKey = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(apiKey, 'sk-test');
      apiKey.dispatchEvent(new Event('input', { bubbles: true }));
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(ctx.models.settings().apiKey).toBe('sk-test');
    expect(container.textContent).toContain('已保存');
    await act(async () => unmount());
    await dispose();
  });
});
