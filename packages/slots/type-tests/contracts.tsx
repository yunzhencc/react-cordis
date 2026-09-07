import type { SettingsEntry, SettingsRegistry } from '../../../examples/router/plugins/settings-layout/src/registry';
import type { SlotOwnerHandle, SlotRegistry, UiRendererService } from '../../renderer/src';
import type { RouteDefinition, RouteRegistry } from '../../router/src';
import type { SlotMap, SlotName, SlotRegistration } from '../src';
import { Slot } from '../../renderer/src';
import { SlotCore } from '../src';

const declarations = {
  'contract.single': { kind: 'single', scope: 'root' },
  'contract.list': { kind: 'list', scope: 'root' },
} as const;

type Contracts = typeof declarations;

declare module '../src' {
  interface SlotContracts extends Contracts {
    'contract.unresolved': { kind: 'single' | 'list'; scope: 'root' };
  }
}

declare const ctx: { slots: SlotRegistry; uiRenderer: UiRendererService; routes: RouteRegistry };
declare const owner: SlotOwnerHandle;
declare const settings: SettingsRegistry;
const Null = () => null;
const core = new SlotCore();

core.declare(declarations);
ctx.slots.createOwner('contract', declarations);
ctx.uiRenderer.slots.createOwner('contract', declarations);
ctx.slots.register({ name: 'root', children: declarations }, Null);
ctx.slots.register({ name: 'contract.single', id: 'optional' }, Null);
ctx.slots.register({ name: 'contract.list', id: 'row', order: 1 }, Null);
ctx.slots.inject('contract.list', () => {});
owner.render('contract.single');
const slot = <Slot name="contract.single" />;
const name: SlotName = 'contract.list';
const validMap: SlotMap = declarations;
const validRegistration: SlotRegistration = { name, id: 'row' };
ctx.slots.register(validRegistration, Null);
declare const chooseList: boolean;
const correlated = chooseList
  ? { name: 'contract.list', id: 'row', order: 1 } as const
  : { name: 'contract.single' } as const;
ctx.slots.register(correlated, Null);

// @ts-expect-error Unknown slot name.
const typo = <Slot name="contract.typo" />;
// @ts-expect-error No arbitrary string fallback.
ctx.slots.register({ name: 'contract.typo' }, Null);
// @ts-expect-error List entries require an id.
ctx.slots.register({ name: 'contract.list' }, Null);
// @ts-expect-error Single entries do not accept order.
ctx.slots.register({ name: 'contract.single', order: 1 }, Null);
// @ts-expect-error A widened kind must not accidentally allow a list without an id.
ctx.slots.register({ name: 'contract.unresolved' }, Null);
const invalidRegistration = { name: 'contract.single', order: 1 } as const;
// @ts-expect-error Named variables cannot bypass single restrictions.
ctx.slots.register(invalidRegistration, Null);
declare const unknownName: string;
// @ts-expect-error A runtime string must not bypass the contract.
ctx.slots.inject(unknownName, () => {});
declare const mixedName: 'contract.single' | 'contract.list';
// @ts-expect-error A name union must be narrowed before omitting the list id.
ctx.slots.register({ name: mixedName }, Null);
// @ts-expect-error Name unions cannot allow ordering a possible single slot.
ctx.slots.register({ name: mixedName, id: 'row', order: 1 }, Null);
// @ts-expect-error Unknown slot in the owner API.
owner.render('contract.typo');
// @ts-expect-error Query APIs have the same name contract.
ctx.slots.entries('contract.typo');
// @ts-expect-error Query APIs have the same name contract.
ctx.slots.spec('contract.typo');
// @ts-expect-error Subscription APIs have the same name contract.
ctx.slots.subscribe('contract.typo', () => {});
// @ts-expect-error Version APIs have the same name contract.
ctx.uiRenderer.slots.version('contract.typo');
// @ts-expect-error Core APIs also check registered names.
core.register({ name: 'contract.typo' }, Null);
// @ts-expect-error Core registration also requires a list id.
core.register({ name: 'contract.list' }, Null);

const wrongKind = { 'contract.list': { kind: 'single', scope: 'root' } } as const;
const unknownChildren = { ...declarations, 'contract.typo': { kind: 'single', scope: 'root' } } as const;
const route = { id: 'contract', Component: Null, children: declarations };
const entry = { ...route, label: 'Contract', group: { id: 'test', label: 'Test', order: 0 }, order: 0 };
const validRoute: RouteDefinition = route;
const validEntry: SettingsEntry = entry;
ctx.routes.register(validRoute);
settings.register(validEntry);

// @ts-expect-error A declared name fixes its kind.
const wrongMap: SlotMap = wrongKind;
// @ts-expect-error Only root scope is supported.
const wrongScope: SlotMap = { 'contract.single': { kind: 'single', scope: 'session' } };
// @ts-expect-error Owners cannot change a contract's kind.
ctx.slots.createOwner('contract', wrongKind);
// @ts-expect-error Core declarations reject unknown keys in named maps.
core.declare(unknownChildren);
// @ts-expect-error Renderer owners reject unknown keys in named maps.
ctx.slots.createOwner('contract', unknownChildren);
// @ts-expect-error The renderer bridge must preserve the map check.
ctx.uiRenderer.slots.createOwner('contract', unknownChildren);
// @ts-expect-error Registrations reject unknown children in named maps.
ctx.slots.register({ name: 'root', children: unknownChildren }, Null);
// @ts-expect-error Route children preserve the contract.
ctx.routes.register({ ...route, children: wrongKind });
// @ts-expect-error Route registration rejects unknown keys in named maps.
ctx.routes.register({ ...route, children: unknownChildren });
// @ts-expect-error Settings children preserve the contract.
settings.register({ ...entry, children: wrongKind });
// @ts-expect-error Settings registration rejects unknown keys in named maps.
settings.register({ ...entry, children: unknownChildren });
declare const unionChildren: typeof declarations | typeof unknownChildren;
// @ts-expect-error A union containing unknown keys is not a checked map.
ctx.slots.createOwner('contract', unionChildren);
// @ts-expect-error Registration forwarding checks every union branch.
ctx.slots.register({ name: 'root', children: unionChildren }, Null);
// @ts-expect-error Route forwarding checks every union branch.
ctx.routes.register({ ...route, children: unionChildren });
// @ts-expect-error Settings forwarding checks every union branch.
settings.register({ ...entry, children: unionChildren });
// @ts-expect-error The renderer bridge checks every union branch.
ctx.uiRenderer.slots.createOwner('contract', unionChildren);

void [slot, typo, validMap, wrongMap, wrongScope];
