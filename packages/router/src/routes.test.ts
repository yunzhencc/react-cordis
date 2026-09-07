import type { RouteDefinition } from './routes';
import { Context } from '@deepseek-ai/cordis';
import { describe, expect, it } from 'vitest';
import { RouteRegistry } from './routes';

const Null = () => null;

const invalidDefinitions: RouteDefinition[][] = [
  [{ id: 'same', Component: Null }, { id: 'same', Component: Null }],
  [{ id: 'index', index: true, path: 'bad', Component: Null }],
  [{ id: 'child', parentId: 'missing', path: 'child', Component: Null }],
  [{ id: 'empty', path: '', Component: Null }],
  [{ id: 'absolute', path: '/absolute', Component: Null }],
  [
    { id: 'parent', Component: Null },
    { id: 'first', parentId: 'parent', index: true, Component: Null },
    { id: 'second', parentId: 'parent', index: true, Component: Null },
  ],
  [
    { id: 'index-parent', index: true, Component: Null },
    { id: 'child', parentId: 'index-parent', path: 'child', Component: Null },
  ],
  [{ id: 'cycle', parentId: 'cycle', Component: Null }],
];

async function bootRoutes() {
  const ctx = new Context();
  let routes!: RouteRegistry;
  const fiber = ctx.plugin({
    apply(pluginCtx) {
      routes = new RouteRegistry(pluginCtx);
    },
  });
  await fiber.await();
  return { ctx, routes, dispose: () => fiber.dispose() };
}

describe('route registry', () => {
  it.each([undefined, 'stable'])('rolls back a failed route under %s and its descendants without losing existing routes', async (parentId) => {
    const { ctx, dispose } = await bootRoutes();
    ctx.routes.register({ id: 'stable', Component: Null });
    ctx.routes.register({ id: 'existing', parentId: 'stable', path: 'existing', Component: Null });
    let removeChild = () => {};
    ctx.routes.inject('candidate', () => {
      removeChild = ctx.routes.register({ id: 'child', parentId: 'candidate', path: 'child', Component: Null });
      ctx.routes.register({ id: 'grandchild', parentId: 'child', path: 'nested', Component: Null });
      ctx.routes.register({ id: 'sibling', parentId: 'candidate', path: 'sibling', Component: Null });
    });
    const failure = new Error('route notification failed');
    const stop = ctx.routes.subscribe(() => {
      throw ctx.routes.snapshot().some(route => route.id === 'candidate') ? failure : new Error('cleanup notification failed');
    });
    const snapshots: string[][] = [];
    const stopHealthy = ctx.routes.subscribe(() => snapshots.push(ctx.routes.snapshot().map(route => route.id)));

    expect(() => ctx.routes.register({ id: 'candidate', parentId, path: 'candidate', Component: Null })).toThrow(failure);
    expect(ctx.routes.snapshot().map(route => route.id)).toEqual(['stable', 'existing']);
    expect(snapshots.at(-1)).toEqual(['stable', 'existing']);
    stop();
    stopHealthy();
    const removeStaleChild = removeChild;
    const removeReplacement = ctx.routes.register({ id: 'candidate', parentId, path: 'candidate', Component: Null });
    removeStaleChild();
    expect(ctx.routes.snapshot().map(route => route.id)).toEqual(['stable', 'existing', 'candidate', 'child', 'grandchild', 'sibling']);
    removeReplacement();
    expect(ctx.routes.snapshot().map(route => route.id)).toEqual(['stable', 'existing']);
    await dispose();
  });

  it('preserves a replacement subtree created during removal notifications', async () => {
    const { ctx, dispose } = await bootRoutes();
    const removeParent = ctx.routes.register({ id: 'parent', Component: Null });
    ctx.routes.register({ id: 'old-child', parentId: 'parent', path: 'old', Component: Null });
    let replaced = false;
    const stop = ctx.routes.inject('parent', () => () => {
      if (replaced)
        return;
      replaced = true;
      ctx.routes.register({ id: 'parent', Component: Null });
      ctx.routes.register({ id: 'new-child', parentId: 'parent', path: 'new', Component: Null });
    });

    removeParent();

    expect(ctx.routes.snapshot().map(route => route.id)).toEqual(['parent', 'new-child']);
    stop();
    await dispose();
  });

  it('waits for a parent route then removes the child with its caller fiber', async () => {
    const { ctx, dispose } = await bootRoutes();
    const child = ctx.plugin({
      inject: ['routes'],
      apply(pluginCtx) {
        pluginCtx.routes.inject('app-layout', () => pluginCtx.routes.register({
          id: 'settings',
          parentId: 'app-layout',
          path: 'settings',
          Component: Null,
        }));
      },
    });
    await child.await();
    ctx.routes.register({ id: 'app-layout', Component: Null });

    expect(ctx.routes.snapshot().map(route => route.id)).toEqual(['app-layout', 'settings']);

    await child.dispose();
    expect(ctx.routes.snapshot().map(route => route.id)).toEqual(['app-layout']);
    await dispose();
  });

  it.each(invalidDefinitions.map(definitions => ({ definitions })))('rejects invalid route definitions', async ({ definitions }) => {
    const { ctx, dispose } = await bootRoutes();

    expect(() => definitions.forEach(route => ctx.routes.register(route))).toThrow();
    await dispose();
  });

  it('rebuilds an injection when its parent route returns', async () => {
    const { ctx, dispose } = await bootRoutes();
    ctx.routes.inject('parent', () => ctx.routes.register({
      id: 'child',
      parentId: 'parent',
      path: 'child',
      Component: Null,
    }));

    const removeParent = ctx.routes.register({ id: 'parent', Component: Null });
    expect(ctx.routes.snapshot().map(route => route.id)).toEqual(['parent', 'child']);

    removeParent();
    expect(ctx.routes.snapshot()).toEqual([]);

    ctx.routes.register({ id: 'parent', Component: Null });
    expect(ctx.routes.snapshot().map(route => route.id)).toEqual(['parent', 'child']);
    await dispose();
  });

  it('stops an injection after its callback throws', async () => {
    const { ctx, dispose } = await bootRoutes();
    let runs = 0;
    const removeParent = ctx.routes.register({ id: 'parent', Component: Null });

    expect(() => ctx.routes.inject('parent', () => {
      runs += 1;
      throw new Error('broken');
    })).toThrow('broken');

    removeParent();
    ctx.routes.register({ id: 'parent', Component: Null });

    expect(runs).toBe(1);
    await dispose();
  });

  it('stops an injection quietly when caller teardown replaces its parent', async () => {
    const { ctx, dispose } = await bootRoutes();
    const removeParent = ctx.routes.register({ id: 'parent', Component: Null });
    let removeReplacement = () => {};
    let runs = 0;
    const caller = ctx.plugin({
      inject: ['routes'],
      apply(pluginCtx) {
        pluginCtx.routes.inject('parent', () => {
          runs += 1;
          return () => {
            removeParent();
            removeReplacement = ctx.routes.register({ id: 'parent', Component: Null });
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

  it('publishes stable snapshots only when routes change', async () => {
    const { ctx, dispose } = await bootRoutes();
    const changes: string[][] = [];
    const initial = ctx.routes.snapshot();
    const unsubscribe = ctx.routes.subscribe(() => {
      changes.push(ctx.routes.snapshot().map(route => route.id));
    });

    const remove = ctx.routes.register({ id: 'parent', Component: Null });
    expect(ctx.routes.snapshot()).toBe(ctx.routes.snapshot());
    remove();
    unsubscribe();

    expect(ctx.routes.snapshot()).not.toBe(initial);
    expect(changes).toEqual([['parent'], []]);
    await dispose();
  });

  it('publishes deeply immutable route snapshots without exposing registration records', async () => {
    const { ctx, dispose } = await bootRoutes();
    const definition: RouteDefinition = {
      id: 'settings',
      path: 'settings',
      Component: Null,
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    };
    const remove = ctx.routes.register(definition);
    const snapshot = ctx.routes.snapshot();
    const exposed = snapshot[0] as RouteDefinition;

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(exposed)).toBe(true);
    expect(Object.isFrozen(exposed.children)).toBe(true);
    expect(Object.isFrozen(exposed.children!['settings.section'])).toBe(true);
    expect(() => {
      exposed.id = 'changed';
    }).toThrow(TypeError);
    expect(() => {
      exposed.children!['settings.section']!.kind = 'single';
    }).toThrow(TypeError);

    remove();
    expect(ctx.routes.snapshot()).toEqual([]);
    await dispose();
  });
});
