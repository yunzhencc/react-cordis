// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis';
import { apply as applyRenderer, inject as rendererInject } from '@react-cordis/renderer';
import { act } from 'react';
import { expect, it } from 'vitest';
import { apply, inject } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('renders without the router host', async () => {
  const ctx = new Context();
  const renderer = ctx.plugin({ apply: applyRenderer, inject: rendererInject });
  await renderer.await();
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
  await renderer.dispose();
});
