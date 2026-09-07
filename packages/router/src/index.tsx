import type { Context } from '@deepseek-ai/cordis';
import type { SlotOwnerHandle, SlotRenderer } from '@react-cordis/renderer';
import type { RouteObject } from 'react-router-dom';
import { SlotOwner } from '@react-cordis/renderer';
import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import { RouteRegistry } from './routes';

export { RouteRegistry } from './routes';
export type { RouteDefinition, RouteSnapshot } from './routes';

export const inject = ['slots', 'uiRenderer'];

interface RouteRenderer {
  snapshot: RouteRegistry['snapshot'];
  subscribe: RouteRegistry['subscribe'];
}

export function apply(ctx: Context) {
  const routes = new RouteRegistry(ctx);
  const slotService = ctx.slots;
  const slots = ctx.uiRenderer.slots;
  const routeRenderer: RouteRenderer = {
    snapshot: () => routes.snapshot(),
    subscribe: listener => routes.subscribe(listener),
  };
  slotService.register({ name: 'root' }, () => <RouterRoot routes={routeRenderer} slots={slots} />);
}

function RouterRoot({ routes, slots }: { routes: RouteRenderer; slots: SlotRenderer }) {
  return (
    <BrowserRouter>
      <RouterRoutes routes={routes} slots={slots} />
    </BrowserRouter>
  );
}

function RouterRoutes({ routes, slots }: { routes: RouteRenderer; slots: SlotRenderer }) {
  const snapshot = useSyncExternalStore(routes.subscribe, routes.snapshot, routes.snapshot);
  return useRoutes(toRouteObjects(slots, snapshot));
}

function RouteSlotOwner({ route, slots }: { route: ReturnType<RouteRegistry['snapshot']>[number]; slots: SlotRenderer }) {
  const [committed, setCommitted] = useState<{ owner: SlotOwnerHandle; route: typeof route }>();
  useLayoutEffect(() => {
    const owner = slots.createOwner(route.id, route.children ?? {});
    // The owner must be created after commit; this render installs its context before paint.
    // eslint-disable-next-line react/set-state-in-effect
    setCommitted({ owner, route });
    return owner.dispose;
  }, [route, slots]);
  if (committed?.route !== route)
    return null;
  const Component = route.Component;
  return (
    <SlotOwner owner={committed.owner}>
      <Component />
    </SlotOwner>
  );
}

function toRouteObjects(slots: SlotRenderer, routes: ReturnType<RouteRegistry['snapshot']>): RouteObject[] {
  const children = new Map<string | undefined, typeof routes>();
  for (const route of routes)
    children.set(route.parentId, [...children.get(route.parentId) ?? [], route]);

  const build = (route: typeof routes[number]): RouteObject => {
    const element = <RouteSlotOwner key={route.id} route={route} slots={slots} />;
    if (route.index)
      return { id: route.id, index: true, element };
    return {
      id: route.id,
      path: route.path,
      element,
      children: children.get(route.id)?.map(build),
    };
  };

  return children.get(undefined)?.map(build) ?? [];
}
