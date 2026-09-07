# Optional Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the layout usable with or without the React Router host, and add a runnable static example that proves it.

**Architecture:** `@yunzhen/cordis-ui-layout` owns only the layout controller and a reusable layout root component. The optional router host owns the root Slot and contributes that component through its no-path `app-layout` Route. A static example is an alternate root host that uses the same layout component and contributes directly to `main`.

**Tech Stack:** Cordis 4, React 19, React Router 7, Vite, Vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-02-optional-router-design.md`

## Global Constraints

- Do not add dependencies.
- `@yunzhen/cordis-ui-layout` must not depend on `@yunzhen/cordis-ui-router` or `react-router-dom`.
- The Agent example retains URL routing; the basic example contains no router package or route API.
- Do not modify existing untracked planning documents.

---

### Task 1: Extract a route-independent layout root

**Files:**
- Modify: `packages/ui/layout/src/index.tsx`
- Modify: `packages/ui/layout/package.json`
- Modify: `packages/ui/layout/src/index.test.tsx`

**Interfaces:**
- Produces: `ctx.layout.Root`, a React component that owns `sidebar`, `main`, `workbench`, and `shell.overlay` Slots.
- Consumes: `ctx.uiRenderer.slots` and `LayoutController`; no `ctx.routes` or router hook.

- [ ] **Step 1: Write the failing test**

```tsx
const layout = ctx.plugin({ inject: ['slots'], apply: applyLayout });
await layout.await();
ctx.slots.register({ name: 'root' }, ctx.layout.Root);
ctx.slots.inject('main', () => ctx.slots.register({ name: 'main' }, () => <p>Static</p>));
const unmount = ctx.uiRenderer.mount(container);
expect(container.textContent).toContain('Static');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ui/layout/src/index.test.tsx`

Expected: FAIL because `ctx.layout.Root` does not exist or layout requires `routes`.

- [ ] **Step 3: Write minimal implementation**

```tsx
export const inject = ['slots'];

const controller = new LayoutController();
controller.Root = () => <LayoutRoot controller={controller} slots={slots} />;
ctx.effect(() => ctx.reflect.provide('layout', controller));
```

`LayoutRoot` creates a Slot owner for the fixed layout Slot map after commit, renders `AppLayout`, and disposes the owner on unmount. Remove `useLocation()` and compute `hasWorkbench` from `workbench` contributions only. Remove router dependencies from `package.json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ui/layout/src/index.test.tsx`

Expected: PASS, including the new static-root test.

### Task 2: Make Router the optional layout host

**Files:**
- Modify: `packages/ui/router/src/index.tsx`
- Modify: `packages/ui/router/package.json`
- Modify: `packages/ui/router/src/index.test.tsx`
- Modify: `examples/layout/cordis.yml`

**Interfaces:**
- Consumes: `ctx.layout.Root` from Task 1.
- Produces: an `app-layout` Route registered by the router host; `main` remains occupied by `RouteOutlet`.

- [ ] **Step 1: Write the failing test**

```tsx
const app = await boot();
const layout = app.ctx.plugin(applyLayout);
await layout.await();
const router = app.ctx.plugin(applyRouter);
await router.await();
expect(app.ctx.routes.snapshot().map(route => route.id)).toContain('app-layout');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/ui/router/src/index.test.tsx`

Expected: FAIL because router does not inject `layout` or register `app-layout`.

- [ ] **Step 3: Write minimal implementation**

```tsx
export const inject = ['layout', 'slots'];

ctx.routes.register({
  id: 'app-layout',
  Component: ctx.layout.Root,
});
```

Move the existing `main` and `sidebar` contributions after this registration. Add layout as a router package dependency and list `layout` before `router` in the Agent boot manifest.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/ui/router/src/index.test.tsx`

Expected: PASS with nested routes still rendered in the layout main Slot.

### Task 3: Scope the dashboard workbench to its route

**Files:**
- Modify: `examples/layout/plugins/dashboard/src/index.tsx`
- Modify: `examples/layout/plugins/dashboard/src/index.test.tsx`

**Interfaces:**
- Consumes: the router page Slot lifecycle and the layout's existing `workbench` Slot.
- Produces: a dashboard-only declaration that registers the workbench contribution only while dashboard is matched.

- [ ] **Step 1: Write the failing test**

```tsx
window.history.pushState({}, '', '/settings');
window.dispatchEvent(new PopStateEvent('popstate'));
expect(container.querySelector('[data-workbench-column]')).toBeNull();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run examples/layout/plugins/dashboard/src/index.test.tsx`

Expected: FAIL because dashboard contributes to the global `workbench` Slot after navigation.

- [ ] **Step 3: Write minimal implementation**

```tsx
children: { 'dashboard.workbench': { kind: 'single', scope: 'root' } },

ctx.slots.inject('dashboard.workbench', () => ctx.slots.inject('workbench', () => ctx.slots.register(
  { name: 'workbench' },
  DashboardWorkbench,
)));
```

Keep the dashboard page and panel controller API unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run examples/layout/plugins/dashboard/src/index.test.tsx`

Expected: PASS for opening the workbench on dashboard and removing it after leaving dashboard.

### Task 4: Add the static basic example

**Files:**
- Create: `examples/basic/package.json`
- Create: `examples/basic/cordis.yml`
- Create: `examples/basic/index.html`
- Create: `examples/basic/vite.config.ts`
- Create: `examples/basic/vite-plugin.ts`
- Create: `examples/basic/src/main.tsx`
- Create: `examples/basic/src/vite-env.d.ts`
- Create: `examples/basic/plugins/page/package.json`
- Create: `examples/basic/plugins/page/src/index.tsx`
- Modify: root `package.json`

**Interfaces:**
- Consumes: `ctx.layout.Root`, `ctx.slots.register()`, `ctx.slots.inject()`.
- Produces: `@examples/basic`, buildable through `pnpm --filter @examples/basic build`.

- [ ] **Step 1: Write the failing test**

```ts
expect(loadWebBootGraph(resolve(import.meta.dirname, '../../basic/cordis.yml')).entries.map(entry => entry.name))
  .not.toContain('@yunzhen/cordis-ui-router');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/host/plugin-catalog/src/index.test.ts`

Expected: FAIL because the basic catalog and its static root plugin do not exist.

- [ ] **Step 3: Write minimal implementation**

Copy only Agent's Vite boot adapter shape, changing its virtual module id and default `cordis.yml` path. The page plugin must register `ctx.layout.Root` in `root`, then inject `main` and register a static heading. Its manifest injects layout; the example manifest lists i18n, renderer, layout, and page only. Add `build:basic` alongside the existing root build script.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @examples/basic build`

Expected: PASS and emit a `cordis.boot.json` that contains no router entry.

### Task 5: Verify the composed applications

**Files:**
- Verify: changed files from Tasks 1-4

**Interfaces:**
- Consumes: final workspace graph and package manifests.
- Produces: evidence that both routing modes type-check and build.

- [ ] **Step 1: Run focused tests**

Run: `pnpm exec vitest run packages/ui/layout/src/index.test.tsx packages/ui/router/src/index.test.tsx examples/layout/plugins/dashboard/src/index.test.tsx packages/host/plugin-catalog/src/index.test.ts`

Expected: PASS.

- [ ] **Step 2: Run type checking**

Run: `CI=true pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 3: Build both examples**

Run: `pnpm --filter @examples/layout build && pnpm --filter @examples/basic build`

Expected: both builds exit 0.

- [ ] **Step 4: Check the patch**

Run: `git diff --check`

Expected: no whitespace errors.
