import type { Context } from '@deepseek-ai/cordis';
import type { SlotRenderer } from './registry';
import { createRoot } from 'react-dom/client';
import { createSlotRenderer, Slot, SlotOwner, SlotRegistry } from './registry';

export * from './react';

export interface UiRendererService {
  mount: (container: HTMLElement) => () => void;
  /** @internal */
  slots: SlotRenderer;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    uiRenderer: UiRendererService;
  }
}

export const inject: string[] = [];

export function apply(ctx: Context) {
  const slots = new SlotRegistry(ctx, name => <div data-slot-error={name} />);
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
