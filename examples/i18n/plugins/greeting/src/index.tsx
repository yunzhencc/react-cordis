import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/i18n';
import type {} from '@react-cordis/renderer';
import { useTranslation } from 'react-i18next';
import { greetingMessages } from './locales';

export const inject = ['i18n', 'slots'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.register('greeting', greetingMessages));
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
