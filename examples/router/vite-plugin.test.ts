import { loadWebBootGraph } from '@react-cordis/boot-config';
import { expect, it } from 'vitest';

it('boots the locale runtime before the UI and its language settings extension', () => {
  const entries = loadWebBootGraph(new URL('./cordis.yml', import.meta.url).pathname).entries;
  const ids = entries.map(entry => entry.id);

  expect(ids.indexOf('i18n')).toBeLessThan(ids.indexOf('renderer'));
  expect(ids.indexOf('settings-layout')).toBeLessThan(ids.indexOf('settings-general'));
  expect(ids.indexOf('settings-general')).toBeLessThan(ids.indexOf('settings-language'));
});

it('declares direct UI runtime dependencies in plugin manifests', () => {
  const entries = loadWebBootGraph(new URL('./cordis.yml', import.meta.url).pathname).entries;
  const injectFor = (id: string) => entries.find(entry => entry.id === id)?.inject ?? [];

  expect(injectFor('dashboard')).toEqual(expect.arrayContaining([
    '@examples/router-app-layout',
    '@react-cordis/renderer',
    '@react-cordis/router',
  ]));
  expect(injectFor('settings-layout')).toContain('@react-cordis/renderer');
  expect(injectFor('settings-general')).toContain('@react-cordis/renderer');
  expect(injectFor('settings-language')).toContain('@react-cordis/renderer');
});
