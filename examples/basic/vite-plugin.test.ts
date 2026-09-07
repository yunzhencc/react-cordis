import { loadWebBootGraph } from '@react-cordis/boot-config';
import { expect, it } from 'vitest';

it('boots the static example without the router host', () => {
  const entries = loadWebBootGraph(new URL('./cordis.yml', import.meta.url).pathname).entries;

  expect(entries.map(entry => entry.name)).toEqual([
    '@react-cordis/i18n',
    '@react-cordis/renderer',
    '@examples/basic-page',
  ]);
});
