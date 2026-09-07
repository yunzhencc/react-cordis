import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/ui-i18n';

export const inject = ['i18n'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }));
  ctx.effect(() => ctx.i18n.register('page', {
    ja: {
      title: '国際化のサンプル',
      description: '言語を切り替えると、両方のプラグインの表示が変わります。',
      language: '表示言語',
      persistence: 'ページを再読み込みしても、選択した言語は保持されます。',
      fallback: '日本語パックは下の見出しだけを翻訳しています。本文は英語にフォールバックします。',
    },
  }));
  ctx.effect(() => ctx.i18n.register('greeting', {
    // Deliberately omit body to demonstrate the English fallback.
    ja: { title: 'ようこそ' },
  }));
}
