import { loadWebBootGraph } from '@yunzhen/cordis-host-plugin-catalog';
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
    '@yunzhen/cordis-ui-layout',
    '@yunzhen/cordis-ui-renderer',
    '@yunzhen/cordis-ui-router',
  ]));
  expect(injectFor('settings-layout')).toContain('@yunzhen/cordis-ui-renderer');
  expect(injectFor('settings-general')).toContain('@yunzhen/cordis-ui-renderer');
  expect(injectFor('settings-language')).toContain('@yunzhen/cordis-ui-renderer');
});
