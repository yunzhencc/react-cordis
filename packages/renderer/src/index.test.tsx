// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { apply, inject, Slot, SlotOwner } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const Null = () => null;

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] });
});

async function bootRenderer() {
  const ctx = new Context();
  const fiber = ctx.plugin({ apply, inject });
  await fiber.await();
  return {
    ctx,
    async dispose() {
      await fiber.dispose();
    },
  };
}

describe('ui renderer', () => {
  it('activates and renders without i18n', async () => {
    const ctx = new Context();
    const fiber = ctx.plugin({ apply, inject });
    await fiber.await();
    try {
      expect(ctx.get('uiRenderer')).toBeDefined();
      ctx.slots.register({ name: 'root' }, () => <h1>Standalone</h1>);
      const container = document.createElement('div');
      await act(async () => {
        ctx.uiRenderer.mount(container);
      });
      expect(container.textContent).toBe('Standalone');
    }
    finally {
      await act(async () => {
        await fiber.dispose();
      });
    }
  });

  it('unmounts React effects when the renderer is disposed', async () => {
    const { ctx, dispose } = await bootRenderer();
    let active = 0;
    const Content = () => {
      useEffect(() => {
        active += 1;
        return () => {
          active -= 1;
        };
      }, []);
      return <h1>Mounted</h1>;
    };
    ctx.slots.register({ name: 'root' }, Content);
    const container = document.createElement('div');
    let unmount!: () => void;
    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });
    expect(active).toBe(1);
    try {
      await act(async () => {
        await dispose();
      });
      expect(container.childNodes).toHaveLength(0);
      expect(active).toBe(0);
    }
    finally {
      await act(async () => unmount());
    }
  });

  it('removes a contribution when its caller fiber is disposed', async () => {
    const { ctx, dispose } = await bootRenderer();
    ctx.slots.register({ name: 'root', children: { host: { kind: 'single', scope: 'root' } } }, Null);
    const fiber = ctx.plugin({
      inject: ['slots'],
      apply(pluginCtx) {
        pluginCtx.slots.register({ name: 'host' }, Null);
      },
    });

    await fiber.await();
    await fiber.dispose();

    expect(ctx.slots.entries('host')).toEqual([]);
    await dispose();
  });

  it('stops an injection after its callback throws', async () => {
    const { ctx, dispose } = await bootRenderer();
    let runs = 0;
    const disposeRoot = ctx.slots.register({ name: 'root', children: { host: { kind: 'single', scope: 'root' } } }, Null);

    expect(() => ctx.slots.inject('host', () => {
      runs += 1;
      throw new Error('broken');
    })).toThrow('broken');
    disposeRoot();
    ctx.slots.register({ name: 'root', children: { host: { kind: 'single', scope: 'root' } } }, Null);

    expect(runs).toBe(1);
    await dispose();
  });

  it('stops an injection quietly when caller teardown replaces its declaration', async () => {
    const { ctx, dispose } = await bootRenderer();
    const removeDeclaration = ctx.slots.register({
      name: 'root',
      children: { host: { kind: 'single', scope: 'root' } },
    }, Null);
    let removeReplacement = () => {};
    let runs = 0;
    const caller = ctx.plugin({
      inject: ['slots'],
      apply(pluginCtx) {
        pluginCtx.slots.inject('host', () => {
          runs += 1;
          return () => {
            removeDeclaration();
            removeReplacement = ctx.slots.register({
              name: 'root',
              children: { host: { kind: 'single', scope: 'root' } },
            }, Null);
          };
        });
      },
    });
    await caller.await();

    await caller.dispose();
    await new Promise<void>(resolve => queueMicrotask(resolve));

    expect(runs).toBe(1);
    removeReplacement();
    await dispose();
  });

  it('mounts only the root Slot and renders declared descendants', async () => {
    const { ctx, dispose } = await bootRenderer();
    const Frame = () => <main><Slot name="host" /></main>;
    const Host = () => <h1>Settings</h1>;
    ctx.slots.register({ name: 'root', children: { host: { kind: 'single', scope: 'root' } } }, Frame);
    ctx.slots.register({ name: 'host' }, Host);
    const container = document.createElement('div');

    let unmount!: () => void;
    await act(async () => {
      unmount = ctx.uiRenderer.mount(container);
    });

    expect(container.innerHTML).toBe('<main><h1>Settings</h1></main>');
    await act(async () => unmount());
    await dispose();
  });

  it('provides a disposable owner for route-declared slots', async () => {
    const { ctx, dispose } = await bootRenderer();
    const owner = ctx.slots.createOwner('settings', {
      'settings.section': { kind: 'list', scope: 'root' },
    });
    ctx.slots.register({ name: 'settings.section', id: 'appearance' }, () => <>Appearance</>);

    expect(renderToStaticMarkup(
      <SlotOwner owner={owner}>
        <Slot name="settings.section" />
      </SlotOwner>,
    )).toBe('Appearance');

    owner.dispose();

    expect(ctx.slots.spec('settings.section')).toBeUndefined();
    expect(ctx.slots.entries('settings.section')).toEqual([]);
    await dispose();
  });

  it('clears a mounted route slot when its owner is disposed', async () => {
    const { ctx, dispose } = await bootRenderer();
    const owner = ctx.slots.createOwner('settings', {
      'settings.section': { kind: 'single', scope: 'root' },
    });
    ctx.slots.register({ name: 'settings.section' }, () => <>Appearance</>);
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SlotOwner owner={owner}>
          <Slot name="settings.section" />
        </SlotOwner>,
      );
    });
    expect(container.textContent).toBe('Appearance');

    await act(async () => owner.dispose());

    expect(container.textContent).toBe('');
    await act(async () => root.unmount());
    await dispose();
  });

  it('throws outside an owner and for a child the owner did not declare', async () => {
    const { ctx, dispose } = await bootRenderer();
    const owner = ctx.slots.createOwner('settings', {});

    expect(() => renderToStaticMarkup(<Slot name="missing" />)).toThrow('without an owner');
    expect(() => renderToStaticMarkup(
      <SlotOwner owner={owner}>
        <Slot name="missing" />
      </SlotOwner>,
    )).toThrow('not declared by owner "settings"');

    owner.dispose();
    await dispose();
  });
});
