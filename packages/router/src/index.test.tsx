// @vitest-environment jsdom

import type { Context as CordisContext } from '@deepseek-ai/cordis';
import { Context } from '@deepseek-ai/cordis';
import { apply as applyRenderer, inject as rendererInject, Slot } from '@react-cordis/renderer';
import { act, StrictMode } from 'react';
import { Outlet } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { apply as applyRouter, inject as routerInject } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

declare module '@react-cordis/slots' {
  interface SlotContracts {
    'main': { kind: 'single'; scope: 'root' };
    'sidebar': { kind: 'single'; scope: 'root' };
    'settings.section': { kind: 'list'; scope: 'root' };
    'settings.first': { kind: 'single'; scope: 'root' };
    'settings.second': { kind: 'single'; scope: 'root' };
  }
}

async function boot() {
  const ctx = new Context();
  const renderer = ctx.plugin({ apply: applyRenderer, inject: rendererInject });
  await renderer.await();
  const router = ctx.plugin({ inject: routerInject, apply: applyRouter });
  await router.await();
  ctx.routes.register({
    id: 'app-layout',
    Component: Outlet,
  });
  const fibers = [router, renderer];
  return {
    ctx,
    container: document.createElement('div'),
    async dispose() {
      for (const fiber of fibers) await fiber.dispose();
    },
    addFiber(fiber: ReturnType<CordisContext['plugin']>) {
      fibers.unshift(fiber);
    },
  };
}

async function bootRouterWithLayout() {
  const app = await boot();
  app.ctx.routes.register({
    id: 'settings',
    parentId: 'app-layout',
    path: 'settings',
    Component: () => <h1>Settings</h1>,
  });
  return app;
}

async function bootRouterWithSettingsSlot() {
  const app = await boot();
  const Settings = () => <section><Slot name="settings.section" /></section>;
  const feature = app.ctx.plugin({
    inject: ['routes', 'slots'],
    apply(ctx) {
      ctx.routes.inject('app-layout', () => ctx.routes.register({
        id: 'settings',
        parentId: 'app-layout',
        path: 'settings',
        Component: Settings,
        children: { 'settings.section': { kind: 'list', scope: 'root' } },
      }));
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'appearance' },
        () => <>Appearance</>,
      ));
    },
  });
  await feature.await();
  app.addFiber(feature);
  return app;
}

describe('router host', () => {
  it('isolates a failed page from its layout and recovers after same-id replacement', async () => {
    window.history.replaceState({}, '', '/settings');
    const { ctx, container, dispose } = await boot();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('broken page');
    let broken = true;
    const Page = () => {
      if (broken)
        throw failure;
      return <h1>Recovered</h1>;
    };
    ctx.routes.register({
      id: 'shell',
      parentId: 'app-layout',
      Component: () => (
        <main>
          <nav>Navigation</nav>
          <Outlet />
        </main>
      ),
    });
    const definition = { id: 'settings', parentId: 'shell', path: 'settings', Component: Page };
    const remove = ctx.routes.register(definition);
    try {
      await act(async () => {
        ctx.uiRenderer.mount(container);
      });
      expect(container.querySelector('nav')?.textContent).toBe('Navigation');
      expect(container.querySelector('main [data-route-error="settings"]')).not.toBeNull();
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('settings'), failure);
      await act(async () => {
        remove();
        broken = false;
        ctx.routes.register(definition);
      });
      expect(container.querySelector('h1')?.textContent).toBe('Recovered');
      expect(container.querySelector('nav')?.textContent).toBe('Navigation');
      expect(container.querySelector('[data-route-error]')).toBeNull();
    }
    finally {
      await act(async () => dispose());
      errorLog.mockRestore();
    }
  });

  it('does not hide a route slot declaration conflict behind a render fallback', async () => {
    window.history.replaceState({}, '', '/settings');
    const { ctx, container, dispose } = await boot();
    const owner = ctx.slots.createOwner('existing', { 'settings.section': { kind: 'list', scope: 'root' } });
    ctx.routes.register({
      id: 'settings',
      parentId: 'app-layout',
      path: 'settings',
      Component: () => <Slot name="settings.section" />,
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    });
    try {
      await expect(act(async () => {
        ctx.uiRenderer.mount(container);
      })).rejects.toThrow('duplicate declaration');
    }
    finally {
      owner.dispose();
      await act(async () => dispose());
    }
  });

  it('leaves layout slots for the application to populate', async () => {
    const { ctx, dispose } = await boot();
    const owner = ctx.slots.createOwner('custom-layout', {
      main: { kind: 'single', scope: 'root' },
      sidebar: { kind: 'single', scope: 'root' },
    });
    try {
      expect(ctx.slots.entries('main')).toEqual([]);
      expect(ctx.slots.entries('sidebar')).toEqual([]);
    }
    finally {
      owner.dispose();
      await dispose();
    }
  });

  it('rejects children below an index route instead of dropping them', async () => {
    const { ctx, dispose } = await boot();
    ctx.routes.register({ id: 'index-parent', index: true, Component: () => null });

    expect(() => ctx.routes.register({
      id: 'child',
      parentId: 'index-parent',
      path: 'child',
      Component: () => null,
    })).toThrow('index route cannot have children');

    await dispose();
  });

  it('renders a pathless layout and its settings child through the application Outlet', async () => {
    window.history.replaceState({}, '', '/settings');
    const { ctx, container, dispose } = await bootRouterWithLayout();
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });

    expect(container.querySelector('h1')?.textContent).toBe('Settings');
    await act(async () => unmount());
    await dispose();
  });

  it('renders a route-declared settings slot inside its matched page', async () => {
    window.history.replaceState({}, '', '/settings');
    const { ctx, container, dispose } = await bootRouterWithSettingsSlot();
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });

    expect(container.textContent).toContain('Appearance');
    await act(async () => unmount());
    await dispose();
  });

  it('commits route slot owners safely in StrictMode and replaces them by route definition', async () => {
    window.history.replaceState({}, '', '/settings');
    const { ctx, container, dispose } = await boot();
    const First = () => <StrictMode><Slot name="settings.first" /></StrictMode>;
    const Second = () => <Slot name="settings.second" />;
    ctx.slots.inject('settings.first', () => ctx.slots.register(
      { name: 'settings.first' },
      () => <>First</>,
    ));
    ctx.slots.inject('settings.second', () => ctx.slots.register(
      { name: 'settings.second' },
      () => <>Second</>,
    ));
    const removeFirst = ctx.routes.register({
      id: 'settings',
      parentId: 'app-layout',
      path: 'settings',
      Component: First,
      children: { 'settings.first': { kind: 'single', scope: 'root' } },
    });
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });
    expect(container.textContent).toBe('First');

    let removeSecond!: () => void;
    await act(async () => {
      removeFirst();
      removeSecond = ctx.routes.register({
        id: 'settings',
        parentId: 'app-layout',
        path: 'settings',
        Component: Second,
        children: { 'settings.second': { kind: 'single', scope: 'root' } },
      });
    });

    expect(container.textContent).toBe('Second');
    expect(ctx.slots.spec('settings.first')).toBeUndefined();
    await act(async () => unmount());
    expect(ctx.slots.spec('settings.second')).toBeUndefined();
    removeSecond();
    await dispose();
  });
});
