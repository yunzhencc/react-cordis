import type { Context } from '@deepseek-ai/cordis';
import type {} from '@examples/multi-platform-storage';
import { I18nRuntime } from '@react-cordis/i18n';

export const name = 'product-i18n';
export const inject = ['storage'];

export async function apply(ctx: Context) {
  const document = ctx.storage.open('locale');
  ctx.effect(() => () => document.close());
  const saved = await document.read();
  if (ctx.fiber.uid === null)
    return;
  const i18n = new I18nRuntime({
    storageKey: false,
    // A corrupt preference must not prevent the product from opening.
    locale: saved === 'zh' || saved === 'en' ? saved : undefined,
  }, locale => document.write(locale));
  ctx.effect(() => () => i18n.dispose());
  ctx.provide('i18n', i18n);
}
