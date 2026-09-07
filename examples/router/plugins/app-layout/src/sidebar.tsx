import type { RouteRegistry, RouteSnapshot } from '@react-cordis/router';
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Slot } from '@react-cordis/renderer';
import { createElement, useSyncExternalStore } from 'react';
import { matchRoutes, useLocation } from 'react-router-dom';
import styles from './sidebar.module.css';

// Sidebar selection is a contract of this application's layout.
declare module '@react-cordis/router' {
  interface RouteDefinition {
    Sidebar?: ComponentType;
  }
}

export function NavigationSidebar({ routes }: { routes: Pick<RouteRegistry, 'subscribe' | 'snapshot'> }) {
  const snapshot = useSyncExternalStore(routes.subscribe, routes.snapshot, routes.snapshot);
  const location = useLocation();
  const Sidebar = findMatchedSidebar(snapshot, location.pathname);
  if (Sidebar)
    return createElement(Sidebar);

  return (
    <div className={styles.sidebar}>
      <div className={styles.scroll} data-sidebar-scroll>
        <nav className={styles.navigation}><Slot name="sidebar.navigation" /></nav>
      </div>
      <footer className={styles.footer}><Slot name="sidebar.footer" /></footer>
    </div>
  );
}

function findMatchedSidebar(routes: readonly RouteSnapshot[], pathname: string) {
  const byId = new Map(routes.map(route => [route.id, route]));
  const matches = matchRoutes(toMatchableRouteObjects(routes), pathname) ?? [];
  for (const match of [...matches].reverse()) {
    const Sidebar = match.route.id && byId.get(match.route.id)?.Sidebar;
    if (Sidebar)
      return Sidebar;
  }
}

function toMatchableRouteObjects(routes: readonly RouteSnapshot[]): RouteObject[] {
  const children = new Map<string | undefined, typeof routes>();
  for (const route of routes)
    children.set(route.parentId, [...children.get(route.parentId) ?? [], route]);

  const build = (route: typeof routes[number]): RouteObject => {
    if (route.index)
      return { id: route.id, index: true };
    return {
      id: route.id,
      path: route.path,
      children: children.get(route.id)?.map(build),
    };
  };

  return children.get(undefined)?.map(build) ?? [];
}
