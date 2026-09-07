// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis';
import { apply as applyI18n } from '@react-cordis/ui-i18n';
import { apply as applyLayout, inject as layoutInject } from '@react-cordis/ui-layout';
import { apply as applyRenderer, inject as rendererInject } from '@react-cordis/ui-renderer';
import { act } from 'react';
import { expect, it } from 'vitest';
import { apply, inject } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('renders without the router host', async () => {
  const ctx = new Context();
  const i18n = ctx.plugin({ apply: applyI18n });
  await i18n.await();
  const renderer = ctx.plugin({ apply: applyRenderer, inject: rendererInject });
  await renderer.await();
  const layout = ctx.plugin({ apply: applyLayout, inject: layoutInject });
  await layout.await();
  const page = ctx.plugin({ apply, inject });
  await page.await();
  const container = document.createElement('div');
  let unmount!: () => void;

  await act(async () => {
    unmount = ctx.uiRenderer.mount(container);
  });

  expect(container.querySelector('h1')?.textContent).toBe('Basic example');

  await act(async () => unmount());
  await page.dispose();
  await layout.dispose();
  await renderer.dispose();
  await i18n.dispose();
});
