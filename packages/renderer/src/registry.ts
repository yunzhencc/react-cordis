import type { Context } from '@deepseek-ai/cordis';
import type { CheckedSlotChildren, CheckedSlotMap, SlotEntry, SlotMap, SlotName, SlotRegistration, SlotSpec } from '@react-cordis/slots';
import type { ComponentType, ReactNode } from 'react';
import { Service } from '@deepseek-ai/cordis';
import { SlotAssemblyError, SlotCore } from '@react-cordis/slots';
import { createContext, createElement, Fragment, use, useSyncExternalStore } from 'react';
import { RenderErrorBoundary } from './error-boundary';

export interface SlotOwnerHandle {
  render: (name: SlotName) => ReactNode;
  dispose: () => void;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: SlotRegistry;
  }
}

/** @internal */
export interface SlotRenderer {
  createOwner: <const T extends SlotMap>(id: string, children: T & NoInfer<CheckedSlotMap<T>>) => SlotOwnerHandle;
  entries: (name: SlotName) => readonly SlotEntry[];
  subscribe: (name: SlotName, listener: () => void) => () => void;
  version: (name: SlotName) => number;
}

/** @internal */
export function createSlotRenderer(slots: SlotRegistry): SlotRenderer {
  return {
    createOwner: (id, children) => slots.createOwner(id, children),
    entries: name => slots.entries(name),
    subscribe: (name, listener) => slots.subscribe(name, listener),
    version: name => slots.version(name),
  };
}

const SlotOwnerContext = createContext<SlotOwnerHandle | null>(null);

export function SlotOwner({ children, owner }: { children?: ReactNode; owner: SlotOwnerHandle }) {
  return createElement(SlotOwnerContext.Provider, { value: owner }, children);
}

export function Slot({ name }: { name: SlotName }) {
  const owner = use(SlotOwnerContext);
  if (!owner)
    throw new SlotAssemblyError(`slot "${name}" rendered without an owner`);
  return owner.render(name);
}

export class SlotRegistry extends Service {
  private readonly core = new SlotCore();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly versions = new Map<string, number>();

  constructor(ctx: Context, private readonly renderErrorFallback: (name: SlotName) => ReactNode = () => null) {
    super(ctx, 'slots');
  }

  register<const T extends SlotRegistration>(options: T & NoInfer<CheckedSlotChildren<T>>, component: ComponentType): () => void;
  register(options: SlotRegistration, component: ComponentType): () => void {
    const disposeEffect = this.ctx.effect(() => {
      const disposeRegistration = this.core.register(options, component);
      const dispose = () => {
        try {
          disposeRegistration();
        }
        finally {
          this.publish(options.name);
        }
      };
      try {
        this.publish(options.name);
      }
      catch (error) {
        try {
          dispose();
        }
        catch {
          // Report the original registration failure after rollback completes.
        }
        throw error;
      }
      return dispose;
    }, 'slots.register()');
    return () => {
      void disposeEffect();
    };
  }

  inject(name: SlotName, callback: () => void | (() => void)): () => void {
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
        const epoch = this.core.declarationEpoch(name);
        if (active && activeEpoch === epoch)
          return;
        deactivate();
        if (stopped || this.core.declarationEpoch(name) !== epoch)
          return;
        if (!this.core.spec(name))
          return;
        const disposeEffect = ctx.effect(() => callback() ?? (() => {}), `slots.inject(${JSON.stringify(name)}): declaration`);
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

      unsubscribe = this.core.subscribeDeclaration(name, changed);
      try {
        reconcile();
      }
      catch (error) {
        stop();
        throw error;
      }
      return stop;
    }, `slots.inject(${JSON.stringify(name)})`);
    return () => {
      void disposeController();
    };
  }

  entries(name: SlotName): readonly SlotEntry[] {
    return this.core.entries(name);
  }

  spec(name: SlotName): SlotSpec | undefined {
    return this.core.spec(name);
  }

  /** @internal */
  createOwner<const T extends SlotMap>(id: string, children: T & NoInfer<CheckedSlotMap<T>>): SlotOwnerHandle;
  createOwner(id: string, children: SlotMap): SlotOwnerHandle {
    const ownedChildren: SlotMap = Object.fromEntries(Object.entries(children).map(([name, spec]) => [name, { ...spec }]));
    const disposeDeclaration = this.core.declare(ownedChildren);
    let live = true;
    return this.owner(id, ownedChildren, () => {
      if (!live)
        return;
      live = false;
      try {
        disposeDeclaration();
      }
      finally {
        this.publish(...Object.keys(ownedChildren));
      }
    }, () => live);
  }

  /** @internal */
  createRootOwner(): SlotOwnerHandle {
    return this.owner('root', { root: { kind: 'single', scope: 'root' } }, () => {});
  }

  private owner(id: string, children: SlotMap, dispose: () => void, isLive = () => true): SlotOwnerHandle {
    return {
      dispose,
      render: (name) => {
        if (!isLive())
          throw new SlotAssemblyError(`slot owner "${id}" is disposed`);
        if (!Object.hasOwn(children, name))
          throw new SlotAssemblyError(`slot "${name}" is not declared by owner "${id}"`);
        return createElement(SlotView, { name, registry: this });
      },
    };
  }

  /** @internal */
  entryOwner(name: SlotName, entry: SlotEntry) {
    return this.owner(entry.id ?? name, entry.children ?? {}, () => {});
  }

  /** @internal */
  errorFallback(name: SlotName) {
    return this.renderErrorFallback(name);
  }

  /** @internal */
  subscribe(name: SlotName, listener: () => void) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size)
        this.listeners.delete(name);
    };
  }

  private publish(...names: string[]) {
    const errors: unknown[] = [];
    for (const name of names) {
      this.versions.set(name, (this.versions.get(name) ?? 0) + 1);
      for (const listener of [...this.listeners.get(name) ?? []]) {
        try {
          listener();
        }
        catch (error) {
          errors.push(error);
        }
      }
    }
    if (errors.length)
      throw errors[0];
  }

  /** @internal */
  version(name: SlotName) {
    return this.versions.get(name) ?? 0;
  }
}

function SlotView({ name, registry }: { name: SlotName; registry: SlotRegistry }) {
  useSyncExternalStore(
    listener => registry.subscribe(name, listener),
    () => registry.version(name),
    () => registry.version(name),
  );
  return createElement(Fragment, null, registry.entries(name).map(entry =>
    createElement(
      RenderErrorBoundary,
      {
        key: entry.sequence,
        label: `slot "${name}"${entry.id === undefined ? '' : ` entry "${entry.id}"`}`,
        fallback: registry.errorFallback(name),
      },
      createElement(
        SlotOwner,
        { owner: registry.entryOwner(name, entry) },
        createElement(entry.component),
      ),
    )));
}
