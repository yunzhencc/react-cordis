import { loadWebBootGraph } from '@react-cordis/host-plugin-catalog';
import { expect, it } from 'vitest';

it('boots the static example without the router host', () => {
  const entries = loadWebBootGraph(new URL('./cordis.yml', import.meta.url).pathname).entries;

  expect(entries.map(entry => entry.name)).toEqual([
    '@react-cordis/ui-i18n',
    '@react-cordis/ui-renderer',
    '@react-cordis/ui-layout',
    '@examples/basic-page',
  ]);
});
