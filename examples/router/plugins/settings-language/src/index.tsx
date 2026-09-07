import type { Context } from '@deepseek-ai/cordis';
import type { I18nRuntime } from '@react-cordis/ui-i18n';
import type {} from '@react-cordis/ui-renderer';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './language-settings.module.css';

const messages = {
  zh: {
    language: {
      description: '应用 UI 语言',
      label: '界面语言',
      title: '语言',
    },
    settings: {
      groups: { personal: '个人' },
    },
  },
  en: {
    language: {
      description: 'Application UI language',
      label: 'Interface language',
      title: 'Language',
    },
    settings: {
      groups: { personal: 'Personal' },
    },
  },
} as const;

export const inject = ['i18n', 'slots'];

export function apply(ctx: Context) {
  const i18n = ctx.i18n;
  ctx.effect(() => ctx.i18n.register('settings-language', messages));
  ctx.slots.inject('settings.general.items', () => ctx.slots.register(
    { name: 'settings.general.items', id: 'language', order: 0 },
    () => <LanguageSettings i18n={i18n} />,
  ));
}

function LanguageSettings({ i18n }: { i18n: I18nRuntime }) {
  const { t } = useTranslation('settings-language');
  const languages = useSyncExternalStore(listener => i18n.subscribe(listener), () => i18n.languages);
  return (
    <section className={styles.row}>
      <div className={styles.copy}>
        <h2>{t('language.title')}</h2>
        <p>{t('language.description')}</p>
      </div>
      <select className={styles.select} aria-label={t('language.label')} value={i18n.locale} onChange={event => void i18n.setLocale(event.currentTarget.value)}>
        {languages.map(language => <option key={language.id} value={language.id}>{language.label}</option>)}
      </select>
    </section>
  );
}
