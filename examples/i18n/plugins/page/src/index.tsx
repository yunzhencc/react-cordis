import type { Context } from '@deepseek-ai/cordis';
import type { I18nRuntime } from '@react-cordis/i18n';
import { I18nProvider } from '@react-cordis/i18n';
import { Slot } from '@react-cordis/renderer';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { pageMessages } from './locales';

export const inject = ['i18n', 'slots'];

export function apply(ctx: Context) {
  const i18n = ctx.i18n;
  ctx.effect(() => i18n.register('page', pageMessages));
  ctx.slots.register({
    name: 'root',
    children: { 'i18n.content': { kind: 'list', scope: 'root' } },
  }, () => <I18nProvider i18n={i18n}><Page i18n={i18n} /></I18nProvider>);
}

function Page({ i18n }: { i18n: I18nRuntime }) {
  const { t } = useTranslation('page');
  const languages = useSyncExternalStore(listener => i18n.subscribe(listener), () => i18n.languages);

  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
      <label>
        {t('language')}
        <select value={i18n.locale} onChange={event => void i18n.setLocale(event.currentTarget.value)}>
          {languages.map(language => <option key={language.id} value={language.id}>{language.label}</option>)}
        </select>
      </label>
      <p>{t('persistence')}</p>
      <Slot name="i18n.content" />
      <p>{t('fallback')}</p>
    </main>
  );
}
