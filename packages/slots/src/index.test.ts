import { describe, expect, it } from 'vitest';
import { SlotCore } from './index';

declare module './index' {
  interface SlotContracts {
    stable: { kind: 'list'; scope: 'root' };
    first: { kind: 'single'; scope: 'root' };
    second: { kind: 'single'; scope: 'root' };
    nested: { kind: 'single'; scope: 'root' };
    host: { kind: 'single'; scope: 'root' };
    row: { kind: 'list'; scope: 'root' };
    missing: { kind: 'single'; scope: 'root' };
    leaked: { kind: 'list'; scope: 'root' };
  }
}

const Null = () => null;

describe('slotCore', () => {
  it.each(['register', 'declare'] as const)('rolls back %s and descendants even when rollback observers throw', (method) => {
    const core = new SlotCore();
    core.declare({ stable: { kind: 'list', scope: 'root' } });
    core.register({ name: 'stable', id: 'existing' }, Null);
    const failure = new Error('activation failed');
    const children = {
      first: { kind: 'single', scope: 'root' },
      second: { kind: 'single', scope: 'root' },
    } as const;
    let disposeDescendant = () => {};
    const stopFirst = core.subscribeDeclaration('first', () => {
      if (core.spec('first')) {
        disposeDescendant = core.register({ name: 'first', children: { nested: { kind: 'single', scope: 'root' } } }, Null);
        core.register({ name: 'nested' }, Null);
        throw failure;
      }
      throw new Error('cleanup failed');
    });
    const states: boolean[] = [];
    core.subscribeDeclaration('first', () => states.push(core.spec('first') !== undefined));

    expect(() => method === 'register'
      ? core.register({ name: 'root', children }, Null)
      : core.declare(children)).toThrow(failure);

    expect(core.entries('root')).toEqual([]);
    expect(core.entries('stable').map(entry => entry.id)).toEqual(['existing']);
    for (const name of ['first', 'second', 'nested'] as const) {
      expect(core.spec(name)).toBeUndefined();
      expect(core.entries(name)).toEqual([]);
    }
    expect(states.at(-1)).toBe(false);
    stopFirst();
    const disposeReplacement = core.register({ name: 'root', children }, Null);
    core.register({ name: 'first' }, Null);
    disposeDescendant();
    expect(core.entries('first')).toHaveLength(1);
    disposeReplacement();
  });

  it('cascades a declarer disposal through descendants and contributions', () => {
    const core = new SlotCore();
    const disposeFrame = core.register({ name: 'root', children: { host: { kind: 'single', scope: 'root' } } }, Null);
    core.register({ name: 'host', children: { row: { kind: 'list', scope: 'root' } } }, Null);
    core.register({ name: 'row', id: 'theme' }, Null);

    disposeFrame();

    expect(core.spec('host')).toBeUndefined();
    expect(core.entries('row')).toEqual([]);
  });

  it('rejects an undeclared target and duplicate declaration', () => {
    const core = new SlotCore();

    expect(() => core.register({ name: 'missing' }, Null)).toThrow('not declared');
    core.register({ name: 'root', children: { host: { kind: 'single', scope: 'root' } } }, Null);
    expect(() => core.register({ name: 'root', children: { host: { kind: 'single', scope: 'root' } } }, Null)).toThrow('duplicate declaration');
  });

  it('requires ids for lists and preserves registration order for equal orders', () => {
    const core = new SlotCore();
    core.register({ name: 'root', children: { row: { kind: 'list', scope: 'root' } } }, Null);

    // @ts-expect-error JavaScript callers still receive runtime validation.
    expect(() => core.register({ name: 'row' }, Null)).toThrow('requires an id');
    core.register({ name: 'row', id: 'second', order: 1 }, Null);
    core.register({ name: 'row', id: 'first', order: 1 }, Null);
    core.register({ name: 'row', id: 'before', order: -1 }, Null);

    expect(core.entries('row').map(entry => entry.id)).toEqual(['before', 'second', 'first']);
  });

  it('notifies declaration epochs and lets stale disposers do nothing', () => {
    const core = new SlotCore();
    const changes: number[] = [];
    const unsubscribe = core.subscribeDeclaration('host', () => changes.push(core.declarationEpoch('host')));
    const dispose = core.register({ name: 'root', children: { host: { kind: 'single', scope: 'root' } } }, Null);

    expect(core.declarationEpoch('host')).toBe(1);
    dispose();
    dispose();
    unsubscribe();

    expect(changes).toEqual([1, 2]);
    expect(core.declarationEpoch('host')).toBe(2);
  });

  it('publishes sibling declarations atomically to re-entrant listeners', () => {
    const core = new SlotCore();
    let siblingDeclared = false;
    let duplicateRejected = false;

    core.subscribeDeclaration('first', () => {
      siblingDeclared = core.spec('second') !== undefined;
      try {
        core.register({ name: 'first', children: { second: { kind: 'single', scope: 'root' } } }, Null);
      }
      catch (error) {
        duplicateRejected = error instanceof Error && error.message.includes('duplicate declaration');
      }
    });

    core.register({
      name: 'root',
      children: {
        first: { kind: 'single', scope: 'root' },
        second: { kind: 'single', scope: 'root' },
      },
    }, Null);

    expect({ duplicateRejected, siblingDeclared }).toEqual({ duplicateRejected: true, siblingDeclared: true });
  });

  it('closes a declaration before descendant listeners can register into it', () => {
    const core = new SlotCore();
    const disposeFrame = core.register({ name: 'root', children: { host: { kind: 'single', scope: 'root' } } }, Null);
    core.register({ name: 'host', children: { row: { kind: 'list', scope: 'root' } } }, Null);
    core.subscribeDeclaration('row', () => {
      if (!core.spec('row')) {
        expect(() => core.register({ name: 'host', children: { leaked: { kind: 'list', scope: 'root' } } }, Null)).toThrow('not declared');
      }
    });

    disposeFrame();

    expect(core.spec('host')).toBeUndefined();
    expect(core.spec('row')).toBeUndefined();
    expect(core.spec('leaked')).toBeUndefined();
  });
});
