import type { Context as CordisContext } from '@deepseek-ai/cordis';
import { Context } from '@deepseek-ai/cordis';
import * as appLayout from '@examples/layout-app-layout';
import { apply as applyI18n } from '@yunzhen/cordis-ui-i18n';
import { apply as applyLayout, inject as layoutInject } from '@yunzhen/cordis-ui-layout';
import { apply as applyRenderer, inject as rendererInject } from '@yunzhen/cordis-ui-renderer';
import { apply as applyRouter } from '@yunzhen/cordis-ui-router';
import { describe, expect, it } from 'vitest';
import { apply } from './index';

const Null = () => null;

async function bootSettings() {
  const ctx = new Context();
  const fibers: ReturnType<CordisContext['plugin']>[] = [];

  for (const module of [
    { apply: applyI18n },
    { apply: applyRenderer, inject: rendererInject },
    { apply: applyLayout, inject: layoutInject },
    { inject: ['layout', 'slots'], apply: applyRouter },
    appLayout,
    { inject: ['i18n', 'routes', 'slots'], apply },
  ]) {
    const fiber = ctx.plugin(module);
    fibers.push(fiber);
    await fiber.await();
  }

  return {
    ctx,
    async dispose() {
      for (const fiber of fibers.reverse()) await fiber.dispose();
    },
  };
}

describe('settings registry', () => {
  it('sorts entries, creates child routes, and removes both with the caller fiber', async () => {
    const { ctx, dispose } = await bootSettings();
    const caller = ctx.plugin({
      inject: ['settings'],
      apply(pluginCtx) {
        pluginCtx.settings.register({
          id: 'shortcuts',
          group: { id: 'coding', label: 'Coding', order: 200 },
          label: 'Keyboard shortcuts',
          order: 10,
          Component: Null,
        });
        pluginCtx.settings.register({
          id: 'appearance',
          group: { id: 'personal', label: 'Personal', order: 100 },
          label: 'Appearance',
          order: 100,
          Component: Null,
        });
      },
    });
    await caller.await();

    expect(ctx.settings.snapshot().map(entry => entry.id)).toEqual(['appearance', 'shortcuts']);
    expect(ctx.routes.snapshot().map(route => route.id)).toEqual([
      'app-layout',
      'settings',
      'settings.shortcuts',
      'settings.appearance',
    ]);

    await caller.dispose();

    expect(ctx.settings.snapshot()).toEqual([]);
    expect(ctx.routes.snapshot().map(route => route.id)).toEqual(['app-layout', 'settings']);
    await dispose();
  });

  it.each([
    [{ ...entry('appearance'), id: 'bad/path' }, /settings entry id/],
    [{ ...entry('appearance'), label: ' ' }, /settings entry label/],
    [{ ...entry('appearance'), group: { id: ' ', label: 'Personal', order: 100 } }, /settings entry group/],
    [{ ...entry('appearance'), order: Infinity }, /settings entry order/],
  ])('rejects an invalid entry', async (value, error) => {
    const { ctx, dispose } = await bootSettings();
    expect(() => ctx.settings.register(value)).toThrow(error);
    await dispose();
  });

  it('rejects duplicate entries and inconsistent groups', async () => {
    const { ctx, dispose } = await bootSettings();
    ctx.settings.register(entry('appearance'));

    expect(() => ctx.settings.register(entry('appearance'))).toThrow(/duplicate settings entry id/);
    expect(() => ctx.settings.register({
      ...entry('shortcuts'),
      group: { id: 'personal', label: 'Different', order: 100 },
    })).toThrow(/inconsistent settings group/);
    await dispose();
  });
});

function entry(id: string) {
  return {
    id,
    group: { id: 'personal', label: 'Personal', order: 100 },
    label: 'Appearance',
    order: 100,
    Component: Null,
  };
}
