// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, I18nRuntime } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'languages', { configurable: true, value: ['zh-CN'] });
});

describe('i18n provider', () => {
  it('refreshes descendants when the active language changes', async () => {
    const i18n = new I18nRuntime();
    const Greeting = () => {
      const { t } = useTranslation('provider-test');
      return <h1>{t('greeting')}</h1>;
    };
    i18n.register('provider-test', {
      zh: { greeting: '你好' },
      en: { greeting: 'Hello' },
    });
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<I18nProvider i18n={i18n}><Greeting /></I18nProvider>);
    });
    expect(container.textContent).toBe('你好');

    await act(async () => i18n.setLocale('en'));
    expect(container.textContent).toBe('Hello');

    await act(async () => root.unmount());
  });

  it('refreshes added and removed dictionaries without emitting language changes', async () => {
    const i18n = new I18nRuntime();
    const Greeting = () => {
      const { t } = useTranslation('late-pack');
      return <h1>{t('greeting')}</h1>;
    };
    i18n.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' });
    i18n.register('late-pack', { en: { greeting: 'Hello' } });
    await i18n.setLocale('ja');
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<I18nProvider i18n={i18n}><Greeting /></I18nProvider>);
    });
    expect(container.textContent).toBe('Hello');

    const languageChanges: string[] = [];
    i18n.instance.on('languageChanged', locale => languageChanges.push(locale));
    let removeDictionary!: () => void;
    await act(async () => {
      removeDictionary = i18n.register('late-pack', { ja: { greeting: 'こんにちは' } });
    });
    expect(container.textContent).toBe('こんにちは');
    expect.soft(languageChanges).toEqual([]);

    await act(async () => removeDictionary());
    expect(container.textContent).toBe('Hello');
    expect(i18n.locale).toBe('ja');
    expect.soft(languageChanges).toEqual([]);

    languageChanges.length = 0;
    await act(async () => i18n.setLocale('en'));
    expect(languageChanges).toEqual(['en']);

    await act(async () => root.unmount());
  });

  it('refreshes translations when a fallback language definition is removed and restored', async () => {
    const i18n = new I18nRuntime();
    const Greeting = () => {
      const { t } = useTranslation('fallback-catalog');
      return <h1>{t('greeting')}</h1>;
    };
    let removeFrench = i18n.addLanguage({ id: 'fr', label: 'Français', fallback: 'en' });
    i18n.addLanguage({ id: 'fr-CA', label: 'Français (Canada)', fallback: 'fr' });
    i18n.register('fallback-catalog', {
      fr: { greeting: 'Bonjour' },
      en: { greeting: 'Hello' },
    });
    await i18n.setLocale('fr-CA');
    const container = document.createElement('div');
    const root = createRoot(container);
    const languageChanges: string[] = [];
    i18n.instance.on('languageChanged', locale => languageChanges.push(locale));

    try {
      await act(async () => {
        root.render(<I18nProvider i18n={i18n}><Greeting /></I18nProvider>);
      });
      expect(container.textContent).toBe('Bonjour');

      await act(async () => removeFrench());
      expect(container.textContent).toBe('Hello');
      expect(i18n.locale).toBe('fr-CA');

      await act(async () => {
        removeFrench = i18n.addLanguage({ id: 'fr', label: 'Français', fallback: 'en' });
      });
      expect(container.textContent).toBe('Bonjour');
      expect(i18n.locale).toBe('fr-CA');
      expect(languageChanges).toEqual([]);
    }
    finally {
      await act(async () => root.unmount());
      removeFrench();
    }
  });
});
