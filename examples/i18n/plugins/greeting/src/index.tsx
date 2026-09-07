import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/i18n';
import type {} from '@react-cordis/renderer';
import { useTranslation } from 'react-i18next';

export const inject = ['i18n', 'slots'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.register('greeting', {
    zh: { title: '欢迎', body: '这条文案在缺少翻译时会回退到英文。' },
    en: { title: 'Welcome', body: 'This message falls back to English when its translation is missing.' },
  }));
  ctx.slots.inject('i18n.content', () => ctx.slots.register({ name: 'i18n.content', id: 'greeting' }, Greeting));
}

function Greeting() {
  const { t } = useTranslation('greeting');
  return (
    <section>
      <h2>{t('title')}</h2>
      <p>{t('body')}</p>
    </section>
  );
}
