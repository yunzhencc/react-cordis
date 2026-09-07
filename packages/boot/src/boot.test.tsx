// @vitest-environment jsdom

import type { PluginModule, PluginRegistry } from './boot';
import { Context } from '@deepseek-ai/cordis';
import { expect, it, vi } from 'vitest';
import { activateWebBootGraph, BootFailure, bootWebApp, renderBootFailure } from './boot';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

it('imports and activates independent plugins concurrently', async () => {
  const slowImport = gate();
  const calls: string[] = [];
  const ctx = new Context();
  const registry: PluginRegistry = new Map<string, () => Promise<PluginModule>>([
    ['@app/slow', async () => {
      calls.push('import slow');
      await slowImport.promise;
      return { apply: () => {
        calls.push('activate slow');
      } };
    }],
    ['@app/fast', async () => {
      calls.push('import fast');
      return { apply: () => {
        calls.push('activate fast');
      } };
    }],
  ]);
  const boot = activateWebBootGraph(ctx, {
    revision: 'test',
    entries: [...registry.keys()].map(name => ({ id: name, name, inject: [] })),
  }, registry);

  try {
    await vi.waitFor(() => expect(calls).toEqual(['import slow', 'import fast', 'activate fast']));
  }
  finally {
    slowImport.release();
    await boot;
    await ctx.fiber.dispose();
  }
  expect(calls.at(-1)).toBe('activate slow');
});

it('waits for service dependencies and their asynchronous activation before mounting', async () => {
  const providerReady = gate();
  const consumerReady = gate();
  const calls: string[] = [];
  const mount = vi.fn(() => () => {});
  const registry: PluginRegistry = new Map<string, () => Promise<PluginModule>>([
    ['@app/consumer', async () => ({
      inject: ['bootDependency'],
      apply: async () => {
        calls.push('consumer');
        await consumerReady.promise;
        return () => {};
      },
    })],
    ['@app/renderer', async () => ({ apply: (ctx) => {
      ctx.provide('uiRenderer', { mount, slots: {} } as never);
      calls.push('renderer');
    } })],
    ['@app/provider', async () => ({ apply: async (ctx) => {
      calls.push('provider');
      await providerReady.promise;
      ctx.provide('bootDependency', true);
      return () => {};
    } })],
  ]);
  const boot = bootWebApp({
    container: document.createElement('div'),
    graph: { revision: 'test', entries: [...registry.keys()].map(name => ({ id: name, name, inject: [] })) },
    registry,
  });

  try {
    await vi.waitFor(() => expect(calls).toEqual(['renderer', 'provider']));
    expect(mount).not.toHaveBeenCalled();
    providerReady.release();
    await vi.waitFor(() => expect(calls).toContain('consumer'));
    expect(mount).not.toHaveBeenCalled();
  }
  finally {
    providerReady.release();
    consumerReady.release();
    const dispose = await boot;
    await dispose();
  }
  expect(mount).toHaveBeenCalledOnce();
});

it('rejects unresolved services instead of mounting an incomplete application', async () => {
  const container = document.createElement('div');
  await expect(bootWebApp({
    container,
    graph: { revision: 'test', entries: [{ id: 'consumer', name: '@app/consumer', inject: [] }] },
    registry: new Map([['@app/consumer', async () => ({ inject: ['missingService'], apply: () => {} })]]),
  })).rejects.toMatchObject({ entryId: 'consumer', stage: 'activate' });
  expect(container.textContent).toContain('missingService');
});

it('does not import packages omitted from the boot graph', async () => {
  const calls: string[] = [];
  let dashboardImports = 0;
  const registry: PluginRegistry = new Map([
    ['@app/renderer', async () => ({ apply: () => { calls.push('renderer'); } })],
    ['@app/router', async () => ({ apply: () => { calls.push('router'); } })],
    ['@app/settings', async () => ({ apply: () => { calls.push('settings'); } })],
    ['@app/dashboard', async () => {
      dashboardImports++;
      return {
        apply: () => {
          calls.push('dashboard');
        },
      };
    }],
  ]);

  await activateWebBootGraph(new Context(), {
    revision: 'test',
    entries: [
      { id: 'renderer', name: '@app/renderer', inject: [] },
      { id: 'router', name: '@app/router', inject: [] },
      { id: 'settings', name: '@app/settings', inject: [] },
    ],
  }, registry);

  expect(calls).toEqual(['renderer', 'router', 'settings']);
  expect(dashboardImports).toBe(0);
});

it('names the importing entry on bundle failure', async () => {
  await expect(activateWebBootGraph(new Context(), {
    revision: 'test',
    entries: [{ id: 'dashboard', name: '@app/dashboard', inject: [] }],
  }, new Map([['@app/dashboard', async () => { throw new Error('offline'); }]])))
    .rejects
    .toMatchObject({ entryId: 'dashboard', stage: 'import' });
});

it('disposes activated plugins when a later import fails', async () => {
  const calls: string[] = [];
  const registry: PluginRegistry = new Map([
    ['@app/renderer', async () => ({ apply: () => {
      calls.push('renderer');
      return () => {
        calls.push('dispose renderer');
      };
    } })],
    ['@app/dashboard', async () => { throw new Error('offline'); }],
  ]);

  await expect(activateWebBootGraph(new Context(), {
    revision: 'test',
    entries: [
      { id: 'renderer', name: '@app/renderer', inject: [] },
      { id: 'dashboard', name: '@app/dashboard', inject: [] },
    ],
  }, registry)).rejects.toMatchObject({ entryId: 'dashboard', stage: 'import' });

  expect(calls).toEqual(['renderer', 'dispose renderer']);
});

it('renders import failures in the boot root', () => {
  const container = document.createElement('div');

  renderBootFailure(container, new BootFailure('dashboard', 'import', new Error('offline')));

  expect(container.querySelector('[role="alert"]')?.textContent).toContain('web boot import failed for dashboard: offline');
});

it('does not activate late imports after a concurrent import fails', async () => {
  const fail = gate();
  const late = gate();
  const dispose = vi.fn();
  const activate = vi.fn(() => dispose);
  const lateActivate = vi.fn();
  const ctx = new Context();
  const registry: PluginRegistry = new Map([
    ['@app/active', async () => ({ apply: () => activate() })],
    ['@app/failure', async () => {
      await fail.promise;
      throw new Error('offline');
    }],
    ['@app/late', async () => {
      await late.promise;
      return { apply: () => {
        lateActivate();
      } };
    }],
  ]);
  const boot = activateWebBootGraph(ctx, {
    revision: 'test',
    entries: [...registry.keys()].map(name => ({ id: name, name, inject: [] })),
  }, registry);
  const outcome = boot.catch(error => error);
  try {
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
    fail.release();
    expect(await outcome).toMatchObject({ entryId: '@app/failure', stage: 'import' });
    expect(dispose).toHaveBeenCalledOnce();
  }
  finally {
    fail.release();
    late.release();
    await outcome;
    await ctx.fiber.dispose();
  }
  expect(lateActivate).not.toHaveBeenCalled();
  expect([...ctx.registry.values()]).toEqual([]);
});

it('reports an activation failure and rolls back every created plugin', async () => {
  const dispose = vi.fn();
  const ctx = new Context();
  await expect(activateWebBootGraph(ctx, {
    revision: 'test',
    entries: [
      { id: 'active', name: '@app/active', inject: [] },
      { id: 'broken', name: '@app/broken', inject: [] },
    ],
  }, new Map([
    ['@app/active', async () => ({ apply: () => dispose })],
    ['@app/broken', async () => ({ apply: () => { throw new Error('broken setup'); } })],
  ]))).rejects.toMatchObject({ entryId: 'broken', stage: 'activate' });
  expect(dispose).toHaveBeenCalledOnce();
  expect([...ctx.registry.values()]).toEqual([]);
});
