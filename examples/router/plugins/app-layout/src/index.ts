import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/layout';
import type {} from '@react-cordis/router';

export const inject = ['layout', 'routes'];

export function apply(ctx: Context) {
  ctx.routes.register({ id: 'app-layout', Component: ctx.layout.Root });
}
