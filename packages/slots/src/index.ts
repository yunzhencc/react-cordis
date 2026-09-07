import type { ComponentType } from 'react';

export type SlotKind = 'single' | 'list';
export type SlotScope = 'root';

export interface SlotSpec {
  kind: SlotKind;
  scope: SlotScope;
}

/** Extend from the owning plugin's literal declarations; this does not mount slots. */
export interface SlotContracts {
  root: { kind: 'single'; scope: 'root' };
}

export type SlotName = Extract<keyof SlotContracts, string>;

/** Runtime declarations, with each name tied to its compile-time contract. */
export type SlotMap = {
  [K in SlotName]?: SlotContracts[K] & SlotSpec;
};

type KeysOfUnion<T> = T extends unknown ? keyof T : never;

/** Check named objects and unions as well as fresh object literals. */
export type CheckedSlotMap<T extends SlotMap> = T & Record<Exclude<KeysOfUnion<T>, SlotName>, never>;

/** Preserve child-name checks through registries that forward slot declarations. */
export interface CheckedSlotChildren<T extends { children?: SlotMap }> {
  children?: CheckedSlotMap<NonNullable<T['children']>>;
}

export interface SlotEntry {
  component: ComponentType;
  id?: string;
  order?: number;
  children?: SlotMap;
}

export type SlotRegistration = {
  [K in SlotName]: {
    name: K;
    children?: SlotMap;
  } & (SlotContracts[K]['kind'] extends 'list'
    ? { id: string; order?: number }
    : SlotContracts[K]['kind'] extends 'single'
      ? { id?: string; order?: never }
      : never);
}[SlotName];

interface DeclarationOwner {
  children?: SlotMap;
  live: boolean;
}

interface StoredEntry extends SlotEntry, DeclarationOwner {
  sequence: number;
}

interface SlotRecord {
  declaredBy?: DeclarationOwner;
  entries: StoredEntry[];
  epoch: number;
  listeners: Set<() => void>;
  spec?: SlotSpec;
}

export class SlotCore {
  private readonly records = new Map<string, SlotRecord>();
  private sequence = 0;

  constructor() {
    const root = this.record('root');
    root.spec = { kind: 'single', scope: 'root' };
    root.epoch = 1;
  }

  register<const T extends SlotRegistration>(options: T & NoInfer<CheckedSlotChildren<T>>, component: ComponentType): () => void;
  register(options: SlotRegistration, component: ComponentType): () => void {
    const slot = this.records.get(options.name);
    if (!slot?.spec)
      throw new Error(`slot "${options.name}" is not declared`);

    const children = copyMap(options.children);
    this.validate(slot, options, children);

    const entry: StoredEntry = {
      component,
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.order === undefined ? {} : { order: options.order }),
      ...(children === undefined ? {} : { children }),
      live: true,
      sequence: this.sequence++,
    };
    slot.entries.push(entry);

    const dispose = () => {
      const changed: SlotRecord[] = [];
      this.remove(entry, slot, changed);
      this.notify(changed);
    };
    this.declareChildren(entry, children ?? {}, dispose);
    return dispose;
  }

  /** @internal */
  declare<const T extends SlotMap>(children: T & NoInfer<CheckedSlotMap<T>>): () => void;
  declare(children: SlotMap): () => void {
    const ownedChildren = copyMap(children) ?? {};
    this.validateChildren(ownedChildren);
    const owner: DeclarationOwner = { children: ownedChildren, live: true };

    const dispose = () => {
      const changed: SlotRecord[] = [];
      this.removeChildren(owner, changed);
      this.notify(changed);
    };
    this.declareChildren(owner, ownedChildren, dispose);
    return dispose;
  }

  spec(name: SlotName): SlotSpec | undefined {
    const spec = this.records.get(name)?.spec;
    return spec && { ...spec };
  }

  entries(name: SlotName): readonly SlotEntry[] {
    const slot = this.records.get(name);
    if (!slot?.spec)
      return [];

    const entries = slot.spec.kind === 'list'
      ? [...slot.entries].sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.sequence - right.sequence)
      : slot.entries;
    return entries.map(copyEntry);
  }

  declarationEpoch(name: SlotName): number {
    return this.records.get(name)?.epoch ?? 0;
  }

  subscribeDeclaration(name: SlotName, listener: () => void): () => void {
    const slot = this.record(name);
    slot.listeners.add(listener);
    return () => slot.listeners.delete(listener);
  }

  private validate(slot: SlotRecord, options: SlotRegistration, children: SlotMap | undefined) {
    this.validateChildren(children ?? {});

    if (slot.spec?.kind === 'single' && slot.entries.length)
      throw new Error(`single slot "${options.name}" already has an entry`);
    if (slot.spec?.kind === 'list') {
      if (typeof options.id !== 'string' || !options.id)
        throw new Error(`list slot "${options.name}" requires an id`);
      if (slot.entries.some(entry => entry.id === options.id))
        throw new Error(`list slot "${options.name}" already has id "${options.id}"`);
      if (options.order !== undefined && !Number.isFinite(options.order))
        throw new Error(`list slot "${options.name}" order must be finite`);
    }
    else if (options.order !== undefined) {
      throw new Error(`single slot "${options.name}" does not accept an order`);
    }
  }

  private validateChildren(children: SlotMap) {
    for (const [name, spec] of Object.entries(children)) {
      if (this.records.get(name)?.spec)
        throw new Error(`duplicate declaration: "${name}"`);
      if (spec.kind !== 'single' && spec.kind !== 'list')
        throw new Error(`slot "${name}" has an invalid kind`);
      if (spec.scope !== 'root')
        throw new Error(`slot "${name}" has an invalid scope`);
    }
  }

  private declareChildren(owner: DeclarationOwner, children: SlotMap, rollback: () => void) {
    const declared: SlotRecord[] = [];
    for (const [name, spec] of Object.entries(children)) {
      const child = this.record(name);
      child.spec = spec;
      child.declaredBy = owner;
      child.epoch++;
      declared.push(child);
    }
    try {
      this.notify(declared);
    }
    catch (error) {
      try {
        rollback();
      }
      catch {
        // Cleanup notifications must not replace the registration error.
      }
      throw error;
    }
  }

  private remove(entry: StoredEntry, slot: SlotRecord, changed: SlotRecord[]) {
    if (!entry.live)
      return;
    slot.entries.splice(slot.entries.indexOf(entry), 1);
    this.removeChildren(entry, changed);
  }

  private removeChildren(owner: DeclarationOwner, changed: SlotRecord[]) {
    if (!owner.live)
      return;
    owner.live = false;
    for (const name of Object.keys(owner.children ?? {})) {
      const child = this.records.get(name);
      if (child?.declaredBy === owner)
        this.removeDeclaration(child, changed);
    }
  }

  private removeDeclaration(slot: SlotRecord, changed: SlotRecord[]) {
    slot.spec = undefined;
    slot.declaredBy = undefined;
    slot.epoch++;
    for (const entry of [...slot.entries]) this.remove(entry, slot, changed);
    changed.push(slot);
  }

  private record(name: string): SlotRecord {
    let slot = this.records.get(name);
    if (!slot) {
      slot = { entries: [], epoch: 0, listeners: new Set() };
      this.records.set(name, slot);
    }
    return slot;
  }

  private notify(slots: SlotRecord[]) {
    const errors: unknown[] = [];
    for (const slot of slots) {
      for (const listener of [...slot.listeners]) {
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
}

function copyEntry(entry: StoredEntry): SlotEntry {
  return {
    component: entry.component,
    ...(entry.id === undefined ? {} : { id: entry.id }),
    ...(entry.order === undefined ? {} : { order: entry.order }),
    ...(entry.children === undefined ? {} : { children: copyMap(entry.children) }),
  };
}

function copyMap(children: SlotMap | undefined): SlotMap | undefined {
  return children && Object.fromEntries(Object.entries(children).map(([name, spec]) => [name, { ...spec }]));
}
