// @vitest-environment jsdom

import { Context } from '@deepseek-ai/cordis';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as themeModule from './index';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => vi.unstubAllGlobals());

it('provides a configured theme without injecting a skin or needing renderer', async () => {
  const ctx = new Context();
  const head = document.head.innerHTML;
  const fiber = ctx.plugin(themeModule, { defaultTheme: 'dark', storageKey: 'app:theme' });
  await fiber.await();
  try {
    expect(ctx.theme.snapshot.resolvedTheme).toBe('dark');
    expect(document.head.innerHTML).toBe(head);
    expect(document.documentElement.style.getPropertyValue('--app-content-font-size')).toBe('');
  }
  finally { await fiber.dispose(); }
  expect(ctx.get('theme')).toBeUndefined();
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
});
