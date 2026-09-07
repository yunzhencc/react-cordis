// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { getSidebarBounds, getWorkbenchBounds, getWorkspaceWidth, LayoutController, MAIN_MIN_WIDTH, readStorage } from './layout-controller';

describe('router layout constraints', () => {
  it('clamps the sidebar while preserving 240px for the remaining shell', () => {
    expect(getSidebarBounds(1600)).toEqual({ defaultSize: 275, maxSize: 520, minSize: 240 });
    expect(getSidebarBounds(600)).toEqual({ defaultSize: 275, maxSize: 360, minSize: 240 });
  });

  it('keeps the workbench within the Codex regular-workspace bounds', () => {
    expect(getWorkbenchBounds(1000, 600)).toEqual({ defaultSize: 500, maxSize: 648, minSize: 320 });
    expect(getWorkbenchBounds(700, 600)).toEqual({ defaultSize: 320, maxSize: 348, minSize: 320 });
  });

  it('uses the actual sidebar width to reserve the main area', () => {
    const workspaceWidth = getWorkspaceWidth(1200, true, 520);

    expect(workspaceWidth).toBe(680);
    expect(MAIN_MIN_WIDTH).toBe(352);
    expect(getWorkbenchBounds(workspaceWidth, 600).maxSize).toBe(328);
  });
});

it('uses the panel default when storage has no value', () => {
  localStorage.clear();
  const bounds = getSidebarBounds(1600);
  expect(readStorage('sidebar-width') ?? bounds.defaultSize).toBe(275);
});

it('continues notifying layout subscribers after a failure and respects unsubscribe', () => {
  const controller = new LayoutController();
  const failure = new Error('broken subscriber');
  const report = vi.spyOn(console, 'error').mockImplementation(() => {});
  const stopBroken = controller.subscribe(() => {
    throw failure;
  });
  const observed: ReturnType<LayoutController['snapshot']>[] = [];
  const stopHealthy = controller.subscribe(() => observed.push(controller.snapshot()));
  try {
    expect(() => controller.closeSidebar()).not.toThrow();
    expect(observed).toEqual([{ sidebarOpen: false, workbenchOpen: false }]);
    expect(report).toHaveBeenCalledWith('app-layout subscriber failed:', failure);
    const snapshot = controller.snapshot();
    controller.closeSidebar();
    expect(controller.snapshot()).toBe(snapshot);
    expect(observed).toHaveLength(1);
    stopHealthy();
    stopBroken();
    controller.openWorkbench();
    expect(observed).toHaveLength(1);
    expect(report).toHaveBeenCalledTimes(1);
  }
  finally { report.mockRestore(); }
});

it('exposes the latest layout snapshot after a subscriber updates another panel', () => {
  const controller = new LayoutController();
  controller.subscribe(() => controller.openWorkbench());
  const observed: ReturnType<LayoutController['snapshot']>[] = [];
  controller.subscribe(() => observed.push(controller.snapshot()));

  controller.closeSidebar();

  expect(observed).toEqual([
    { sidebarOpen: false, workbenchOpen: true },
    { sidebarOpen: false, workbenchOpen: true },
  ]);
});
