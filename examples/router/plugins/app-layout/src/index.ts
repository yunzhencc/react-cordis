import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/ui-layout';
import type {} from '@react-cordis/ui-router';

export const inject = ['layout', 'routes'];

export function apply(ctx: Context) {
  ctx.routes.register({ id: 'app-layout', Component: ctx.layout.Root });
}
