import type { Context } from '@deepseek-ai/cordis';
import { SlotRegistry } from './registry';

export { RenderErrorBoundary } from './error-boundary';
export { Slot, SlotOwner, SlotRegistry } from './registry';
export type { SlotOwnerHandle, SlotRenderer } from './registry';

export const inject: string[] = [];

export function apply(ctx: Context) {
  void new SlotRegistry(ctx);
}
