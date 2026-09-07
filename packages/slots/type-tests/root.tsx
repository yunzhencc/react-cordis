import type { SlotRegistry } from '../../renderer/src';
import type { SlotName } from '../src';
import { Slot } from '../../renderer/src';
import { SlotCore } from '../src';

declare const slots: SlotRegistry;
const Null = () => null;
const core = new SlotCore();
const name: SlotName = 'root';
core.register({ name }, Null);
slots.register({ name: 'root' }, Null);
const root = <Slot name="root" />;

// @ts-expect-error An unextended project only knows root.
const businessName: SlotName = 'sidebar';
// @ts-expect-error Type fixtures from the augmented project must not leak here.
slots.register({ name: 'contract.list', id: 'row' }, Null);
// @ts-expect-error Core name queries have no arbitrary string fallback.
core.spec('unknown');
// @ts-expect-error Root is single and cannot be ordered.
slots.register({ name: 'root', order: 1 }, Null);
// @ts-expect-error Runtime declarations alone do not extend the type contract.
core.declare({ sidebar: { kind: 'single', scope: 'root' } });

void [root, businessName];
