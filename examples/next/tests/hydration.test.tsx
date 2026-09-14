// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PluginPanel, PluginProvider } from '../src/plugin-provider';
import * as runtimeModule from '../src/runtime';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('renders plugin data before JS, hydrates without mismatch, and toggles the live plugin', async () => {
  const starts = vi.spyOn(runtimeModule, 'startPlugins');
  const initial = { enabled: true, items: [{ title: 'SSR article', url: 'https://example.com/article' }] };
  const tree = <StrictMode><PluginProvider initial={initial}><PluginPanel /></PluginProvider></StrictMode>;
  const html = renderToString(tree);
  expect(html).toContain('SSR article');
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const errors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, { onRecoverableError: error => errors.push(error) });
  });
  try {
    const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
    await expect.poll(async () => {
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      return toggle().disabled;
    }).toBe(false);
    await act(async () => toggle().click());
    expect(container.textContent).toContain('收藏插件已停用');
    expect(container.textContent).not.toContain('SSR article');
    await act(async () => toggle().click());
    expect(container.textContent).toContain('SSR article');
    expect(errors).toEqual([]);
    const runtimes = await Promise.all(starts.mock.results.map(result => result.value));
    for (const discarded of runtimes.slice(0, -1))
      await expect.poll(() => discarded.ctx.favorites).toBeUndefined();
    const active = runtimes.at(-1)!;
    const service = active.ctx.favorites;
    await act(async () => root.unmount());
    for (const runtime of runtimes)
      await expect.poll(() => runtime.ctx.favorites).toBeUndefined();
    await expect(service.add({ title: 'Late', url: 'https://example.com/late' })).rejects.toThrow('inactive');
  }
  finally {
    await act(async () => root.unmount());
    container.remove();
    starts.mockRestore();
  }
});
