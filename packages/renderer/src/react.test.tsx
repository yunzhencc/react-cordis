// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis';
import { apply, Slot, SlotOwner, SlotRegistry } from '@react-cordis/renderer/react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('neutral React renderer', () => {
  it('installs disposable slots without a DOM renderer or intrinsic error fallback', async () => {
    const ctx = new Context();
    const renderer = ctx.plugin({ apply });
    await renderer.await();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const contribution = ctx.plugin({
      inject: ['slots'],
      apply(pluginCtx) {
        pluginCtx.slots.register({ name: 'root' }, () => {
          throw new Error('broken neutral contribution');
        });
      },
    });
    await contribution.await();
    const container = document.createElement('div');
    const root = createRoot(container);

    try {
      expect(ctx.slots).toBeInstanceOf(SlotRegistry);
      expect(ctx.get('uiRenderer')).toBeUndefined();
      await act(async () => {
        root.render(
          <SlotOwner owner={ctx.slots.createRootOwner()}>
            <Slot name="root" />
          </SlotOwner>,
        );
      });
      expect(container.innerHTML).toBe('');
      expect(container.querySelector('[data-slot-error]')).toBeNull();

      await act(async () => contribution.dispose());
      expect(ctx.slots.entries('root')).toEqual([]);
    }
    finally {
      await act(async () => root.unmount());
      await renderer.dispose();
      errorLog.mockRestore();
    }
  });
});
