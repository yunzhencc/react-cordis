import { Context } from '@deepseek-ai/cordis';
import * as productI18n from '@examples/multi-platform-i18n';
import { provideStorage } from '@examples/multi-platform-storage';
import { expect, it, vi } from 'vitest';

it('restores locale through host storage, survives failed writes, and closes pending saves', async () => {
  let saved: string | null = 'zh';
  let fail = false;
  let release!: () => void;
  let gate = Promise.resolve();
  const write = vi.fn(async (_name, value) => {
    await gate;
    if (fail)
      throw new Error('disk full');
    saved = value;
  });
  const open = async () => {
    const ctx = new Context();
    provideStorage(ctx, { read: async () => saved, write });
    const fiber = ctx.plugin(productI18n);
    await fiber.await();
    return { ctx, fiber };
  };
  const first = await open();
  expect(first.ctx.i18n.locale).toBe('zh');
  await first.ctx.i18n.setLocale('en');
  expect(write).toHaveBeenLastCalledWith('locale', 'en');
  fail = true;
  await expect(first.ctx.i18n.setLocale('zh')).rejects.toThrow('disk full');
  expect(first.ctx.i18n.locale).toBe('en');
  await first.ctx.fiber.dispose();
  fail = false;
  const second = await open();
  expect(second.ctx.i18n.locale).toBe('en');
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saving = second.ctx.i18n.setLocale('zh');
  let closed = false;
  const stop = Promise.resolve(second.ctx.fiber.dispose()).then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  release();
  await Promise.all([saving, stop]);
  expect(saved).toBe('zh');
  const third = await open();
  expect(third.ctx.i18n.locale).toBe('zh');
  await third.ctx.fiber.dispose();
});
