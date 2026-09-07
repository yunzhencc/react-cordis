// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis';
import { apply as applyI18n } from '@react-cordis/i18n';
import { apply as applyRenderer, inject as rendererInject } from '@react-cordis/renderer';
import * as router from '@react-cordis/router';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { apply, inject } from './index';
import { LayoutController } from './layout-controller';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const Workbench = () => <section>Workbench</section>;
const EmptyPage = () => null;

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

async function bootLayout(Component = EmptyPage) {
  const ctx = new Context();
  const i18n = ctx.plugin({ apply: applyI18n });
  await i18n.await();
  const renderer = ctx.plugin({ apply: applyRenderer, inject: rendererInject });
  await renderer.await();
  const routerFiber = ctx.plugin(router);
  await routerFiber.await();
  const layout = ctx.plugin({ inject, apply });
  await layout.await();
  ctx.routes.register({ id: 'page', parentId: 'app-layout', index: true, Component });

  return {
    ctx,
    container: document.createElement('div'),
    async dispose() {
      await layout.dispose();
      await routerFiber.dispose();
      await renderer.dispose();
      await i18n.dispose();
    },
  };
}

describe('router app layout', () => {
  it('publishes frozen snapshots that external writes cannot mutate', () => {
    const controller = new LayoutController();
    const initial = controller.snapshot();

    expect(Object.isFrozen(initial)).toBe(true);
    expect(() => {
      (initial as { sidebarOpen: boolean }).sidebarOpen = false;
    }).toThrow(TypeError);
    expect(controller.snapshot().sidebarOpen).toBe(true);

    controller.toggleSidebar();
    const updated = controller.snapshot();
    expect(Object.isFrozen(updated)).toBe(true);
    expect(() => {
      (updated as { workbenchOpen: boolean }).workbenchOpen = true;
    }).toThrow(TypeError);
    expect(controller.snapshot()).toEqual({ sidebarOpen: false, workbenchOpen: false });
  });

  it('fully hides the sidebar and lets main fill the frame', async () => {
    const { ctx, container, dispose } = await bootLayout();
    ctx.appLayout.toggleSidebar();
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });

    expect(container.querySelector('[data-app-layout]')?.getAttribute('data-sidebar-open')).toBe('false');
    expect(container.querySelector('[data-sidebar-column]')).toBeNull();
    expect(container.querySelectorAll('[data-panel]')).toHaveLength(1);

    await act(async () => unmount());
    await dispose();
  });

  it('keeps a collapsed workbench mounted so it can reopen', async () => {
    const { ctx, container, dispose } = await bootLayout();
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });

    expect(container.querySelector('[data-workbench-column]')).toBeNull();
    await act(async () => {
      ctx.slots.register({ name: 'workbench' }, Workbench);
      ctx.appLayout.openWorkbench();
    });
    expect(container.querySelector('[data-workbench-column]')).not.toBeNull();
    await act(async () => ctx.appLayout.closeWorkbench());
    expect(container.querySelector('[data-workbench-column]')).not.toBeNull();
    await act(async () => ctx.appLayout.openWorkbench());
    expect(container.querySelector('[data-workbench-column]')).not.toBeNull();

    await act(async () => unmount());
    await dispose();
  });

  it('shows an occupant registered after the workbench opens', async () => {
    const { ctx, container, dispose } = await bootLayout();
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
      ctx.appLayout.openWorkbench();
    });

    expect(container.querySelector('[data-workbench-column]')).toBeNull();
    await act(async () => {
      ctx.slots.register({ name: 'workbench' }, Workbench);
    });
    expect(container.querySelector('[data-workbench-column]')).not.toBeNull();

    await act(async () => unmount());
    await dispose();
  });

  it('renders draggable Codex-style separators for visible rails', async () => {
    const { ctx, container, dispose } = await bootLayout();
    let unmount!: () => void;

    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });
    await act(async () => {
      ctx.slots.register({ name: 'workbench' }, Workbench);
      ctx.appLayout.openWorkbench();
    });

    expect(container.querySelector('[data-group]')).not.toBeNull();
    expect(container.querySelector('#sidebar')).not.toBeNull();
    expect(container.querySelector('#workbench')).not.toBeNull();
    expect(container.querySelectorAll('[data-separator]')).toHaveLength(2);

    await act(async () => unmount());
    await dispose();
  });
});
