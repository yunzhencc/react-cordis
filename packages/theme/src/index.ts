import type { Context } from '@deepseek-ai/cordis';
import type { ThemeConfig } from './theme';
import { ThemeRuntime } from './theme';

export { getThemeScript, ThemeRuntime } from './theme';
export type { ResolvedTheme, ThemeConfig, ThemePreference, ThemeSnapshot } from './theme';

declare module '@deepseek-ai/cordis' {
  interface Context {
    theme: ThemeRuntime;
  }
}

export const inject: string[] = [];

export function apply(ctx: Context, config: ThemeConfig = {}) {
  const theme = new ThemeRuntime(config);
  ctx.effect(() => () => theme.dispose(), 'theme.dispose()');
  ctx.reflect.provide('theme', theme);
}
