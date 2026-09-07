import { afterEach, expect, it, vi } from 'vitest';
import { I18nRuntime } from './i18n';

afterEach(() => vi.unstubAllGlobals());

it('does not use a host navigator outside the browser', () => {
  vi.stubGlobal('navigator', { language: 'zh-CN', languages: ['zh-CN'] });

  expect(new I18nRuntime().locale).toBe('en');
});
