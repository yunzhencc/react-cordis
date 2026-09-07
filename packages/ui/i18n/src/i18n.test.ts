// @vitest-environment jsdom

import type { I18nConfig } from './i18n';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nRuntime } from './i18n';

describe('i18n runtime', () => {
  beforeEach(() => localStorage.clear());
  it('uses the browser language until the user selects another language', async () => {
    localStorage.clear();
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] });
    const runtime = new I18nRuntime();

    expect(runtime.locale).toBe('zh');
    await runtime.setLocale('en');
    expect(runtime.locale).toBe('en');
    expect(localStorage.getItem('react-cordis:locale')).toBe('en');
    expect(new I18nRuntime().locale).toBe('en');
  });

  it.each([null, [], 'invalid', { storageKey: '' }, { storageKey: '  ' }, { storageKey: null }, { storageKey: 42 }])('rejects invalid storage config %j', (config) => {
    expect(() => new I18nRuntime(config as I18nConfig)).toThrow(/config|storageKey/);
  });

  it('uses navigator.language after navigator.languages', () => {
    localStorage.clear();
    Object.defineProperty(navigator, 'languages', { configurable: true, value: [] });
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'zh-TW' });

    expect(new I18nRuntime().locale).toBe('zh');
  });

  it('activates a saved language when its plugin registers the language pack', () => {
    localStorage.setItem('react-cordis:locale', 'ja');
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['fr-FR'] });
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'fr-FR' });
    const runtime = new I18nRuntime();

    const dispose = runtime.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' });

    expect(runtime.locale).toBe('ja');
    expect(runtime.languages).toContainEqual({ id: 'ja', label: '日本語', fallback: 'en' });
    dispose();
    expect(runtime.locale).toBe('en');
  });

  it('releases language-pack dictionaries when the plugin unloads', () => {
    const runtime = new I18nRuntime();
    const dispose = runtime.register('greeting', { ja: { welcome: 'こんにちは' } });

    expect(runtime.instance.getResource('ja', 'greeting', 'welcome')).toBe('こんにちは');
    dispose();
    expect(runtime.instance.getResource('ja', 'greeting', 'welcome')).toBeUndefined();
  });
});
