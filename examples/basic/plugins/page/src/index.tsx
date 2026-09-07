import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/ui-layout';
import type {} from '@react-cordis/ui-renderer';

export const inject = ['layout', 'slots'];

export function apply(ctx: Context) {
  ctx.slots.register({ name: 'root' }, ctx.layout.Root);
  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main' },
    () => (
      <main>
        <h1>Basic example</h1>
        <p>This page does not use routing.</p>
      </main>
    ),
  ));
}
