// @vitest-environment jsdom

import type { I18nConfig } from './i18n';
import { Context } from '@deepseek-ai/cordis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nRuntime } from './i18n';
import { apply } from './index';

describe('i18n runtime', () => {
  beforeEach(() => localStorage.clear());
  it('disconnects an unloaded runtime without affecting its replacement', async () => {
    const ctx = new Context();
    const fiber = ctx.plugin({ apply });
    await fiber.await();
    const previous = ctx.i18n;
    await previous.setLocale('zh');
    const notifications: string[] = [];
    previous.subscribe(() => notifications.push('previous'));
    await fiber.dispose();

    const replacementFiber = ctx.plugin({ apply });
    await replacementFiber.await();
    const replacement = ctx.i18n;
    replacement.subscribe(() => notifications.push('replacement'));
    try {
      await replacement.setLocale('en');
      expect(document.documentElement.lang).toBe('en');
      await previous.instance.changeLanguage('zh');
      expect(document.documentElement.lang).toBe('en');
      expect(notifications).toEqual(['replacement']);
    }
    finally {
      await replacementFiber.dispose();
    }
  });

  it('makes disposal and stale runtime operations harmless while preserving snapshots', async () => {
    const runtime = new I18nRuntime();
    const removeLanguage = runtime.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' });
    const removeDictionary = runtime.register('greeting', { ja: { title: 'こんにちは' } });
    await runtime.setLocale('ja');
    const languages = runtime.languages;
    let changes = 0;
    runtime.subscribe(() => {
      changes += 1;
    });

    let externalEvents = 0;
    const onLanguage = () => {
      externalEvents += 1;
    };
    runtime.instance.on('languageChanged', onLanguage);
    runtime.dispose();
    runtime.dispose();
    runtime.subscribe(() => {
      changes += 1;
    });
    await runtime.setLocale('en');
    runtime.addLanguage({ id: 'fr', label: 'Français', fallback: 'en' })();
    runtime.register('late', { en: { title: 'Late' } })();
    removeLanguage();
    removeDictionary();

    expect(runtime.locale).toBe('ja');
    expect(runtime.languages).toBe(languages);
    expect(runtime.instance.t('greeting:title')).toBe('こんにちは');
    expect(runtime.instance.hasResourceBundle('en', 'late')).toBe(false);
    expect(localStorage.getItem('react-cordis:locale')).toBe('ja');
    expect(changes).toBe(0);

    runtime.dispose();
    await runtime.instance.changeLanguage('en');
    expect(externalEvents).toBe(1);
    expect(document.documentElement.lang).toBe('ja');
    expect(changes).toBe(0);
    runtime.instance.off('languageChanged', onLanguage);
  });

  it('stops an in-progress notification when a subscriber disposes the runtime', async () => {
    const runtime = new I18nRuntime();
    let changes = 0;
    runtime.subscribe(() => runtime.dispose());
    runtime.subscribe(() => {
      changes += 1;
    });

    await runtime.setLocale('en');

    expect(changes).toBe(0);
  });

  it('leaves common resources and namespace fallback to consumers', () => {
    const runtime = new I18nRuntime();
    expect.soft(runtime.instance.t('close', { ns: 'common', lng: 'en' })).toBe('close');

    const dispose = runtime.register('common', { en: { shared: 'Application text' } });
    expect(runtime.instance.t('shared', { ns: 'common', lng: 'en' })).toBe('Application text');
    expect.soft(runtime.instance.t('shared', { ns: 'feature', lng: 'en' })).toBe('shared');
    dispose();
  });

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

  it('does not remove a new registration when an old disposer is repeated with reused dictionaries', () => {
    const runtime = new I18nRuntime();
    const messages = { en: { title: 'Hello' } };
    const disposeOld = runtime.register('greeting', messages);
    disposeOld();
    const disposeNew = runtime.register('greeting', messages);

    disposeOld();
    expect(runtime.instance.t('greeting:title', { lng: 'en' })).toBe('Hello');
    disposeNew();
    expect(runtime.instance.getResource('en', 'greeting', 'title')).toBeUndefined();
  });

  it.each([
    ['iw-IL', 'he-IL'],
    ['en-US-posix', 'en-US-u-va-posix'],
    ['iw', 'he'],
  ])('uses canonical keys internally while preserving the registered %s ID', async (id, canonical) => {
    localStorage.setItem('react-cordis:locale', canonical);
    const runtime = new I18nRuntime();
    runtime.register('greeting', { en: { title: 'Hello' } });
    const disposeDictionary = runtime.register('greeting', { [id]: { title: 'Local translation' } });
    const disposeLanguage = runtime.addLanguage({ id, label: 'Local language', fallback: 'en' });

    expect.soft(runtime.locale).toBe(id);
    expect.soft(runtime.instance.t('greeting:title')).toBe('Local translation');
    await runtime.setLocale(canonical);
    expect.soft(runtime.locale).toBe(id);
    expect.soft(document.documentElement.lang).toBe(id);
    expect.soft(localStorage.getItem('react-cordis:locale')).toBe(id);
    expect(() => runtime.addLanguage({ id: canonical, label: 'Duplicate', fallback: 'en' })).toThrow(/already registered/);
    expect(() => runtime.register('greeting', { [canonical]: { title: 'Duplicate' } })).toThrow(/already has locale/);

    runtime.addLanguage({ id: 'fr-CA', label: 'Canadian French', fallback: canonical });
    await runtime.setLocale('fr-CA');
    expect(runtime.instance.t('greeting:title')).toBe('Local translation');
    disposeLanguage();
    expect(runtime.instance.t('greeting:title')).toBe('Hello');
    runtime.addLanguage({ id, label: 'Local language', fallback: 'en' });
    expect(runtime.instance.t('greeting:title')).toBe('Local translation');
    disposeDictionary();
    expect(runtime.instance.t('greeting:title')).toBe('Hello');
  });

  it.each(['pt-br', 'pt-BR', 'PT-br'])('resolves and disposes %s resources regardless of language ID casing', async (locale) => {
    const runtime = new I18nRuntime();
    const disposeEnglish = runtime.register('greeting', { EN: { welcome: 'Hello' } });
    const dispose = runtime.register('greeting', { [locale]: { welcome: 'Olá' } });
    runtime.addLanguage({ id: 'pt-BR', label: 'Português', fallback: 'EN' });
    await runtime.setLocale('PT-BR');

    expect(runtime.locale).toBe('pt-BR');
    expect(localStorage.getItem('react-cordis:locale')).toBe('pt-BR');
    expect(runtime.instance.t('welcome', { ns: 'greeting' })).toBe('Olá');
    expect(() => runtime.register('greeting', { 'PT-BR': { welcome: 'Duplicate' } })).toThrow(/already has locale/);

    runtime.addLanguage({ id: 'es-AR', label: 'Español', fallback: 'PT-br' });
    await runtime.setLocale('ES-ar');
    expect(runtime.instance.t('welcome', { ns: 'greeting' })).toBe('Olá');
    dispose();
    expect(runtime.instance.t('welcome', { ns: 'greeting' })).toBe('Hello');

    const disposeReplacement = runtime.register('greeting', { 'PT-BR': { welcome: 'Olá novamente' } });
    dispose();
    expect(runtime.instance.t('welcome', { ns: 'greeting' })).toBe('Olá novamente');
    disposeReplacement();
    disposeEnglish();
  });

  it('rejects case-equivalent locale IDs in one dictionary registration before adding resources', () => {
    const runtime = new I18nRuntime();
    expect(() => runtime.register('duplicate-case', {
      en: { welcome: 'Hello' },
      EN: { welcome: 'Duplicate' },
    })).toThrow(/already has locale/);
    expect(runtime.instance.t('welcome', { ns: 'duplicate-case', lng: 'en' })).toBe('welcome');
    const dispose = runtime.register('duplicate-case', { en: { welcome: 'Hello' } });
    expect(runtime.instance.t('welcome', { ns: 'duplicate-case', lng: 'en' })).toBe('Hello');
    dispose();
  });

  it('isolates subscriber failures during language registration, disposal and switching', async () => {
    const runtime = new I18nRuntime();
    await runtime.setLocale('zh');
    const error = new Error('subscriber failed');
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    const counts: number[] = [];
    runtime.subscribe(() => {
      throw error;
    });
    runtime.subscribe(() => counts.push(runtime.languages.length));

    try {
      const dispose = runtime.addLanguage({ id: 'de', label: 'Deutsch', fallback: 'en' });
      expect(counts).toEqual([3]);
      dispose();
      expect(runtime.languages.map(language => language.id)).toEqual(['zh', 'en']);
      expect(counts).toEqual([3, 2]);

      await runtime.setLocale('en');
      expect(runtime.locale).toBe('en');
      expect(counts).toEqual([3, 2, 2]);
      expect(reported).toHaveBeenCalledWith('i18n subscriber failed:', error);
    }
    finally {
      reported.mockRestore();
    }
  });
});
