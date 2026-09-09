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
    entries: [...registry.keys()].map(name => ({ id: name, name, dependencies: [] })),
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
    graph: { revision: 'test', entries: [...registry.keys()].map(name => ({ id: name, name, dependencies: [] })) },
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

it('disposes every plugin even when the renderer unmount throws', async () => {
  const calls: string[] = [];
  const failure = new Error('unmount failed');
  const registry: PluginRegistry = new Map<string, () => Promise<PluginModule>>([
    ['@app/resource', async () => ({ apply: () => () => {
      calls.push('resource');
    } })],
    ['@app/renderer', async () => ({ apply: (ctx) => {
      ctx.provide('uiRenderer', {
        slots: {},
        mount: () => () => {
          throw failure;
        },
      } as never);
      return () => {
        calls.push('renderer');
      };
    } })],
  ]);
  const dispose = await bootWebApp({
    container: document.createElement('div'),
    graph: { revision: 'test', entries: [...registry.keys()].map(name => ({ id: name, name, dependencies: [] })) },
    registry,
  });

  await expect(dispose()).rejects.toBe(failure);
  expect(calls).toEqual(['renderer', 'resource']);
});

it('rejects unresolved services instead of mounting an incomplete application', async () => {
  const container = document.createElement('div');
  await expect(bootWebApp({
    container,
    graph: { revision: 'test', entries: [{ id: 'consumer', name: '@app/consumer', dependencies: [] }] },
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
      { id: 'renderer', name: '@app/renderer', dependencies: [] },
      { id: 'router', name: '@app/router', dependencies: [] },
      { id: 'settings', name: '@app/settings', dependencies: [] },
    ],
  }, registry);

  expect(calls).toEqual(['renderer', 'router', 'settings']);
  expect(dashboardImports).toBe(0);
});

it('names the importing entry on bundle failure', async () => {
  await expect(activateWebBootGraph(new Context(), {
    revision: 'test',
    entries: [{ id: 'dashboard', name: '@app/dashboard', dependencies: [] }],
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
    ['@app/dashboard', async () => {
      await vi.waitFor(() => expect(calls).toContain('renderer'));
      throw new Error('offline');
    }],
  ]);

  await expect(activateWebBootGraph(new Context(), {
    revision: 'test',
    entries: [
      { id: 'renderer', name: '@app/renderer', dependencies: [] },
      { id: 'dashboard', name: '@app/dashboard', dependencies: [] },
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
    entries: [...registry.keys()].map(name => ({ id: name, name, dependencies: [] })),
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

it('uses official groups to isolate services and toggle an entire subtree', async () => {
  const ctx = new Context();
  const seen: string[] = [];
  const released: string[] = [];
  const group = (id: string) => ({
    id,
    name: 'cordis:group',
    group: true,
    dependencies: [],
    isolate: { scopedValue: true as const },
    config: [
      { id: `${id}-provider`, name: 'provider', dependencies: [], config: { value: id } },
      { id: `${id}-consumer`, name: 'consumer', dependencies: [] },
    ],
  });
  await activateWebBootGraph(ctx, { revision: 'groups', entries: [group('left'), group('right')] }, new Map([
    ['provider', async () => ({ apply(scope: Context, config: unknown) {
      scope.provide('scopedValue', (config as { value: string }).value);
    } })],
    ['consumer', async () => ({ inject: ['scopedValue'], apply(scope: Context) {
      const value = scope.get('scopedValue') as string;
      seen.push(value);
      return () => {
        released.push(value);
      };
    } })],
  ]));
  try {
    expect(seen.toSorted()).toEqual(['left', 'right']);
    expect(ctx.get('scopedValue')).toBeUndefined();
    await ctx.loader.update('left', { disabled: true });
    await ctx.loader.await();
    expect(released).toEqual(['left']);
    await ctx.loader.update('left', { disabled: false });
    await ctx.loader.await();
    expect(seen.filter(value => value === 'left')).toHaveLength(2);
    expect(seen.filter(value => value === 'right')).toHaveLength(1);
  }
  finally {
    await ctx.fiber.dispose();
  }
  expect(released.toSorted()).toEqual(['left', 'left', 'right']);
});

it('keeps disabled entries available for an explicit Loader enable', async () => {
  const ctx = new Context();
  const apply = vi.fn();
  const importer = vi.fn(async () => ({ apply }));
  await activateWebBootGraph(ctx, {
    revision: 'disabled',
    entries: [{ id: 'optional', name: 'optional', dependencies: [], disabled: true }],
  }, new Map([['optional', importer]]));
  try {
    expect(importer).not.toHaveBeenCalled();
    await ctx.loader.update('optional', { disabled: false });
    await ctx.loader.await();
    expect(apply).toHaveBeenCalledOnce();
  }
  finally {
    await ctx.fiber.dispose();
  }
});

it('attributes import failures to active entries rather than disabled duplicates', async () => {
  const ctx = new Context();
  await expect(activateWebBootGraph(ctx, {
    revision: 'diagnostics',
    entries: [
      { id: 'optional', name: 'shared', dependencies: [], disabled: true },
      { id: 'actual', name: 'shared', dependencies: [] },
    ],
  }, new Map([['shared', async () => { throw new Error('offline'); }]])))
    .rejects
    .toMatchObject({ entryId: 'actual', stage: 'import' });
  expect([...ctx.registry.values()]).toEqual([]);
});

it('identifies a shared module and its candidate entries when an import is ambiguous', async () => {
  const ctx = new Context();
  await expect(activateWebBootGraph(ctx, {
    revision: 'diagnostics',
    entries: ['left', 'right'].map(id => ({
      id,
      name: 'cordis:group',
      group: true,
      dependencies: [],
      config: [{ id: `${id}-child`, name: 'shared', dependencies: [] }],
    })),
  }, new Map([['shared', async () => { throw new Error('offline'); }]])))
    .rejects
    .toMatchObject({ entryId: 'shared', message: expect.stringContaining('left-child, right-child') });
  expect([...ctx.registry.values()]).toEqual([]);
});

it('reports an activation failure and rolls back every created plugin', async () => {
  const dispose = vi.fn();
  const ctx = new Context();
  await expect(activateWebBootGraph(ctx, {
    revision: 'test',
    entries: [
      { id: 'active', name: '@app/active', dependencies: [] },
      { id: 'broken', name: '@app/broken', dependencies: [] },
    ],
  }, new Map([
    ['@app/active', async () => ({ apply: () => dispose })],
    ['@app/broken', async () => ({ apply: () => { throw new Error('broken setup'); } })],
  ]))).rejects.toMatchObject({ entryId: 'broken', stage: 'activate' });
  expect(dispose).toHaveBeenCalledOnce();
  expect([...ctx.registry.values()]).toEqual([]);
});
