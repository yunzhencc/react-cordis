import type { Context } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/renderer';

export const inject = ['slots'];

export function apply(ctx: Context) {
  ctx.slots.register({ name: 'root' }, () => (
    <main>
      <h1>Basic example</h1>
      <p>This page does not use routing.</p>
    </main>
  ));
}
