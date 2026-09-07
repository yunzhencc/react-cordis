import type { Context } from '@deepseek-ai/cordis';
import type { SlotRenderer } from './registry';
import { createRoot } from 'react-dom/client';
import { createSlotRenderer, Slot, SlotOwner, SlotRegistry } from './registry';

export { Slot, SlotOwner, SlotRegistry };
export type { SlotOwnerHandle, SlotRenderer } from './registry';

export interface UiRendererService {
  mount: (container: HTMLElement) => () => void;
  /** @internal */
  slots: SlotRenderer;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: SlotRegistry;
    uiRenderer: UiRendererService;
  }
}

export const inject: string[] = [];

export function apply(ctx: Context) {
  const slots = new SlotRegistry(ctx);
  const slotRenderer = createSlotRenderer(slots);
  ctx.provide('uiRenderer', {
    slots: slotRenderer,
    mount(container) {
      const dispose = ctx.effect(() => {
        const root = createRoot(container);
        root.render(
          <SlotOwner owner={slots.createRootOwner()}>
            <Slot name="root" />
          </SlotOwner>,
        );
        return () => root.unmount();
      }, 'uiRenderer.mount()');
      return () => {
        void dispose();
      };
    },
  });
}
