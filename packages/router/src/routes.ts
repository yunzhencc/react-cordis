import type { Context } from '@deepseek-ai/cordis';
import type { SlotSpec } from '@react-cordis/slots';
import type { ComponentType } from 'react';
import { Service } from '@deepseek-ai/cordis';

export interface RouteDefinition {
  id: string;
  parentId?: string;
  path?: string;
  index?: boolean;
  Component: ComponentType;
  children?: Record<string, SlotSpec>;
}

export type RouteSnapshot = Readonly<
  Omit<RouteDefinition, 'children'>
  & {
    children?: Readonly<Record<string, Readonly<SlotSpec>>>;
  }
>;

interface RouteRecord {
  epoch: number;
  listeners: Set<() => void>;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    routes: RouteRegistry;
  }
}

export class RouteRegistry extends Service {
  private readonly routes = new Map<string, RouteSnapshot>();
  private readonly records = new Map<string, RouteRecord>();
  private readonly listeners = new Set<() => void>();
  private currentSnapshot: readonly RouteSnapshot[] = Object.freeze([]);
  private transactionDepth = 0;
  private changed = false;

  constructor(ctx: Context) {
    super(ctx, 'routes');
  }

  snapshot = () => this.currentSnapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  register(definition: RouteDefinition): () => void {
    const disposeEffect = this.ctx.effect(() => {
      const route = copyRoute(definition);
      this.validate(route);
      const dispose = () => this.transaction(() => this.remove(route));
      try {
        this.transaction(() => {
          this.routes.set(route.id, route);
          this.changed = true;
          this.bump(route.id);
        });
      }
      catch (error) {
        try {
          dispose();
        }
        catch {
          // Cleanup notifications must not replace the registration error.
        }
        throw error;
      }
      return dispose;
    }, 'routes.register()');
    return () => {
      void disposeEffect();
    };
  }

  inject(parentId: string, callback: () => void | (() => void)): () => void {
    const ctx = this.ctx;
    const disposeController = ctx.effect(() => {
      let active: (() => void) | undefined;
      let activeEpoch: number | undefined;
      let stopped = false;
      let unsubscribe = () => {};

      const deactivate = () => {
        const dispose = active;
        active = undefined;
        activeEpoch = undefined;
        dispose?.();
      };

      const stop = () => {
        if (stopped)
          return;
        stopped = true;
        unsubscribe();
        deactivate();
      };

      const reconcile = () => {
        if (stopped)
          return;
        const epoch = this.record(parentId).epoch;
        if (active && activeEpoch === epoch)
          return;
        deactivate();
        if (stopped || this.record(parentId).epoch !== epoch)
          return;
        if (!this.routes.has(parentId))
          return;
        const disposeEffect = ctx.effect(() => callback() ?? (() => {}), `routes.inject(${JSON.stringify(parentId)}): parent`);
        active = () => {
          void disposeEffect();
        };
        activeEpoch = epoch;
      };

      const changed = () => {
        try {
          reconcile();
        }
        catch (error) {
          stop();
          if (error && typeof error === 'object' && 'code' in error && error.code === 'INACTIVE_EFFECT')
            return;
          const failure = error instanceof Error ? error : new Error(String(error));
          queueMicrotask(() => {
            throw failure;
          });
        }
      };

      const record = this.record(parentId);
      record.listeners.add(changed);
      unsubscribe = () => record.listeners.delete(changed);
      try {
        reconcile();
      }
      catch (error) {
        stop();
        throw error;
      }
      return stop;
    }, `routes.inject(${JSON.stringify(parentId)})`);
    return () => {
      void disposeController();
    };
  }

  private validate(route: RouteSnapshot) {
    if (this.routes.has(route.id))
      throw new Error(`duplicate route id: "${route.id}"`);
    if (route.index && route.path !== undefined)
      throw new Error(`index route cannot have a path: "${route.id}"`);
    if (route.path !== undefined && (!route.path.trim() || route.path.startsWith('/') || route.path === '.' || route.path === '..'))
      throw new Error(`route path must be a non-empty relative path: "${route.id}"`);
    if ([...this.routes.values()].some(existing => existing.parentId === route.parentId && existing.index && route.index))
      throw new Error(`only one index route is allowed under parent: "${route.parentId ?? 'root'}"`);

    let parentId = route.parentId;
    while (parentId !== undefined) {
      if (parentId === route.id)
        throw new Error(`route parent cycle: "${route.id}"`);
      const parent = this.routes.get(parentId);
      if (!parent)
        throw new Error(`unknown parent route: "${parentId}"`);
      if (parent.index)
        throw new Error(`index route cannot have children: "${parent.id}"`);
      parentId = parent.parentId;
    }
  }

  private remove(route: RouteSnapshot) {
    const removed: RouteRecord[] = [];
    this.removeTree(route, removed);
    this.notify(removed.flatMap(record => [...record.listeners]));
  }

  private removeTree(route: RouteSnapshot, removed: RouteRecord[]) {
    if (this.routes.get(route.id) !== route)
      return;
    this.routes.delete(route.id);
    this.changed = true;
    const record = this.record(route.id);
    record.epoch += 1;
    removed.push(record);
    for (const child of [...this.routes.values()]) {
      if (child.parentId === route.id)
        this.removeTree(child, removed);
    }
  }

  private bump(id: string) {
    const record = this.record(id);
    record.epoch += 1;
    this.notify([...record.listeners]);
  }

  private record(id: string) {
    let record = this.records.get(id);
    if (!record) {
      record = { epoch: 0, listeners: new Set() };
      this.records.set(id, record);
    }
    return record;
  }

  private notify(listeners: (() => void)[]) {
    const errors: unknown[] = [];
    for (const listener of listeners) {
      try {
        listener();
      }
      catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw errors[0];
  }

  private transaction(callback: () => void) {
    this.transactionDepth += 1;
    try {
      callback();
    }
    finally {
      this.transactionDepth -= 1;
      if (!this.transactionDepth && this.changed) {
        this.changed = false;
        this.currentSnapshot = Object.freeze([...this.routes.values()]);
        this.notify([...this.listeners]);
      }
    }
  }
}

function copyRoute(route: RouteDefinition): RouteSnapshot {
  const children = route.children && Object.freeze(Object.fromEntries(
    Object.entries(route.children).map(([name, spec]) => [name, Object.freeze({ ...spec })]),
  ));
  return Object.freeze({
    ...route,
    ...(children ? { children } : {}),
  });
}
