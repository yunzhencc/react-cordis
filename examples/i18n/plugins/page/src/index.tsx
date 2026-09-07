import type { Context } from '@deepseek-ai/cordis';
import type { I18nRuntime } from '@react-cordis/i18n';
import { Slot } from '@react-cordis/renderer';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

export const inject = ['i18n', 'slots'];

export function apply(ctx: Context) {
  const i18n = ctx.i18n;
  ctx.effect(() => i18n.register('page', {
    zh: {
      title: '国际化示例',
      description: '切换语言，观察两个插件的文案同步变化。',
      language: '界面语言',
      persistence: '刷新页面后会保留所选语言。',
      fallback: '日语语言包只翻译了下方标题，正文会回退到英文。',
    },
    en: {
      title: 'Internationalization example',
      description: 'Switch languages to update the text from both plugins.',
      language: 'Interface language',
      persistence: 'Your language selection is kept after a page reload.',
      fallback: 'The Japanese language pack translates the greeting title only; its body falls back to English.',
    },
  }));
  ctx.slots.register({
    name: 'root',
    children: { 'i18n.content': { kind: 'list', scope: 'root' } },
  }, () => <Page i18n={i18n} />);
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
