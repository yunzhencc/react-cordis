import type { Context } from '@deepseek-ai/cordis';
import type { SlotOwnerHandle, SlotRenderer } from '@react-cordis/renderer';
import type {} from '@react-cordis/router';
import type { PanelImperativeHandle, PanelSize } from 'react-resizable-panels';
import type { PanelBounds } from './layout-controller';
import { I18nProvider } from '@react-cordis/i18n';
import { Slot, SlotOwner } from '@react-cordis/renderer';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Outlet } from 'react-router-dom';
import styles from './index.module.css';
import { getSidebarBounds, getWorkbenchBounds, getWorkspaceWidth, LayoutController, MAIN_MIN_WIDTH, readStorage } from './layout-controller';
import { NavigationSidebar } from './sidebar';

export { LayoutController } from './layout-controller';
export type { LayoutSnapshot } from './layout-controller';

export const inject = ['routes', 'uiRenderer', 'slots', 'i18n'];

const layoutSlots = {
  'sidebar': { kind: 'single', scope: 'root' },
  'main': { kind: 'single', scope: 'root' },
  'workbench': { kind: 'single', scope: 'root' },
  'shell.overlay': { kind: 'list', scope: 'root' },
} as const;

const sidebarSlots = {
  'sidebar.navigation': { kind: 'list', scope: 'root' },
  'sidebar.footer': { kind: 'list', scope: 'root' },
} as const;

type LayoutSlots = typeof layoutSlots & typeof sidebarSlots;

declare module '@react-cordis/slots' {
  interface SlotContracts extends LayoutSlots {}
}

export function apply(ctx: Context) {
  const i18n = ctx.i18n;
  const controller = new LayoutController();
  const slots = ctx.uiRenderer.slots;
  ctx.provide('appLayout', controller);
  const routeService = ctx.routes;
  const routes = {
    snapshot: () => routeService.snapshot(),
    subscribe: (listener: () => void) => routeService.subscribe(listener),
  };
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main' }, Outlet));
  ctx.slots.inject('sidebar', () => ctx.slots.register({
    name: 'sidebar',
    children: sidebarSlots,
  }, () => <NavigationSidebar routes={routes} />));
  ctx.routes.register({
    id: 'app-layout',
    Component: () => <I18nProvider i18n={i18n}><LayoutRoot controller={controller} slots={slots} /></I18nProvider>,
  });
}

function LayoutRoot({ controller, slots }: { controller: LayoutController; slots: SlotRenderer }) {
  const [owner, setOwner] = useState<SlotOwnerHandle>();
  useLayoutEffect(() => {
    const nextOwner = slots.createOwner('app-layout', layoutSlots);
    // eslint-disable-next-line react/set-state-in-effect
    setOwner(nextOwner);
    return nextOwner.dispose;
  }, [slots]);

  if (!owner)
    return null;
  return <SlotOwner owner={owner}><AppLayout controller={controller} slots={slots} /></SlotOwner>;
}

function AppLayout({ controller, slots }: { controller: LayoutController; slots: SlotRenderer }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const viewport = useViewport();
  const autoHiddenRef = useRef({ sidebar: false, workbench: false });
  useSyncExternalStore(
    listener => slots.subscribe('workbench', listener),
    () => slots.version('workbench'),
    () => slots.version('workbench'),
  );
  const hasWorkbenchOccupant = slots.entries('workbench').length > 0;
  const hasWorkbench = hasWorkbenchOccupant;
  const sidebarBounds = getSidebarBounds(viewport.width);
  const [sidebarSize, setSidebarSize] = useStoredSize('sidebar-width', sidebarBounds);
  const sidebarDefaultSize = useRef(sidebarSize).current;
  const workspaceWidth = getWorkspaceWidth(viewport.width, snapshot.sidebarOpen, sidebarSize);
  const workbenchBounds = getWorkbenchBounds(workspaceWidth, viewport.height);
  const workbenchSize = useStoredRatio('app-shell:right-panel-width:v3', workspaceWidth, workbenchBounds);
  const sidebarSizeRef = useRef(sidebarSize);
  const workbenchSizeRef = useRef(workbenchSize);
  const workbenchPanelRef = useRef<PanelImperativeHandle>(null);

  useEffect(() => {
    if (viewport.width <= 720 && snapshot.sidebarOpen) {
      autoHiddenRef.current.sidebar = true;
      controller.closeSidebar();
    }
    else if (viewport.width > 720 && autoHiddenRef.current.sidebar) {
      autoHiddenRef.current.sidebar = false;
      controller.openSidebar();
    }

    if (viewport.width <= 960 && snapshot.workbenchOpen && hasWorkbench) {
      autoHiddenRef.current.workbench = true;
      controller.closeWorkbench();
    }
    else if (viewport.width > 960 && autoHiddenRef.current.workbench && hasWorkbenchOccupant) {
      autoHiddenRef.current.workbench = false;
      controller.openWorkbench();
    }
  }, [controller, hasWorkbench, hasWorkbenchOccupant, snapshot.sidebarOpen, snapshot.workbenchOpen, viewport.width]);

  useEffect(() => {
    if (!hasWorkbench)
      return;
    const timeout = window.setTimeout(() => {
      if (snapshot.workbenchOpen)
        workbenchPanelRef.current?.expand();
      else
        workbenchPanelRef.current?.collapse();
    });
    return () => window.clearTimeout(timeout);
  }, [hasWorkbench, snapshot.workbenchOpen]);

  const updateSidebarSize = ({ inPixels }: PanelSize) => {
    sidebarSizeRef.current = inPixels;
  };
  const updateWorkbenchSize = ({ inPixels }: PanelSize) => {
    workbenchSizeRef.current = inPixels;
    if (inPixels < 160)
      controller.closeWorkbench();
  };
  const persistLayout = (_layout: unknown, meta: { isUserInteraction: boolean }) => {
    if (!meta.isUserInteraction)
      return;
    const nextSidebarSize = sidebarSizeRef.current;
    setSidebarSize(nextSidebarSize);
    writeStorage('sidebar-width', sidebarSizeRef.current);
    const nextWorkspaceWidth = getWorkspaceWidth(viewport.width, snapshot.sidebarOpen, nextSidebarSize);
    if (nextWorkspaceWidth > 0)
      writeStorage('app-shell:right-panel-width:v3', workbenchSizeRef.current / nextWorkspaceWidth);
  };

  return (
    <div className={styles.layout} data-app-layout data-sidebar-open={String(snapshot.sidebarOpen)}>
      <Group className={styles.group} id="app-layout-panels" orientation="horizontal" resizeTargetMinimumSize={{ coarse: 16, fine: 16 }} onLayoutChanged={persistLayout}>
        {snapshot.sidebarOpen && (
          <>
            <Panel defaultSize={`${sidebarDefaultSize}px`} groupResizeBehavior="preserve-pixel-size" id="sidebar" maxSize={`${sidebarBounds.maxSize}px`} minSize={`${sidebarBounds.minSize}px`} onResize={updateSidebarSize}>
              <aside className={styles.sidebar} data-sidebar-column><Slot name="sidebar" /></aside>
            </Panel>
            <Separator className={styles.separator} id="sidebar-resize" />
          </>
        )}
        <Panel groupResizeBehavior="preserve-relative-size" id="main" minSize={`${MAIN_MIN_WIDTH}px`}>
          <main className={styles.main}><Slot name="main" /></main>
        </Panel>
        {hasWorkbench && (
          <>
            <Separator className={styles.separator} id="workbench-resize" />
            <Panel collapsedSize="0px" collapsible defaultSize={`${workbenchSize}px`} groupResizeBehavior="preserve-pixel-size" id="workbench" maxSize={`${workbenchBounds.maxSize}px`} minSize={`${workbenchBounds.minSize}px`} panelRef={workbenchPanelRef} onResize={updateWorkbenchSize}>
              <aside className={styles.workbench} data-workbench-column><Slot name="workbench" /></aside>
            </Panel>
          </>
        )}
      </Group>
      <Slot name="shell.overlay" />
    </div>
  );
}

function useViewport() {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const update = () => setViewport(readViewport());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return viewport;
}

function useStoredSize(key: string, bounds: PanelBounds) {
  const [size, setSize] = useState(() => clamp(readStorage(key) ?? bounds.defaultSize, bounds));
  return [clamp(size, bounds), setSize] as const;
}

function useStoredRatio(key: string, width: number, bounds: PanelBounds) {
  const [ratio] = useState(() => readStorage(key));
  return clamp(ratio === undefined ? bounds.defaultSize : ratio * width, bounds);
}

function readViewport() {
  return { height: window.innerHeight, width: window.innerWidth };
}

function writeStorage(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  }
  catch {}
}

function clamp(value: number, bounds: PanelBounds) {
  return Math.min(Math.max(value, bounds.minSize), bounds.maxSize);
}
