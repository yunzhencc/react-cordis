import type { Context } from '@deepseek-ai/cordis';
import type {} from '@examples/router-app-layout';
import type { TranslationKey, TranslationNamespace } from '@react-cordis/i18n';
import type {} from '@react-cordis/renderer';
import type {} from '@react-cordis/router';
import { Settings } from 'lucide-react';
import { createElement, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import styles from './index.module.css';
import { settingsLayoutMessages } from './locales';
import { SettingsRegistry } from './registry';

export { SettingsRegistry } from './registry';
export type { SettingsEntry } from './registry';

export const inject = ['routes', 'slots', 'i18n'];

export function apply(ctx: Context) {
  const i18n = ctx.i18n;
  ctx.effect(() => i18n.register('settings-layout', settingsLayoutMessages));
  const settings = new SettingsRegistry(ctx);
  ctx.routes.inject('app-layout', () => ctx.routes.register({
    id: 'settings',
    parentId: 'app-layout',
    path: 'settings',
    Component: () => <SettingsLayout settings={settings} />,
    Sidebar: () => <SettingsSidebar settings={settings} />,
  }));
  ctx.slots.inject('sidebar.footer', () => ctx.slots.register(
    { name: 'sidebar.footer', id: 'settings', order: 100 },
    SettingsFooterLink,
  ));
}

function SettingsLayout({ settings }: { settings: SettingsRegistry }) {
  const { t } = useTranslation<['settings-layout', ...TranslationNamespace[]]>(['settings-layout']);
  const entries = useSettingsEntries(settings);
  const location = useLocation();
  if (!entries.length) {
    return (
      <section className={styles.empty}>
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.empty')}</p>
      </section>
    );
  }
  if (location.pathname === '/settings' || location.pathname === '/settings/')
    return <Navigate replace to={entries[0]!.id} />;

  const current = entries.find(entry => location.pathname === `/settings/${entry.id}`);
  return (
    <section className={styles.content}>
      <h1>{current ? labelOf(current, t) : t('settings.title')}</h1>
      <Outlet />
    </section>
  );
}

function SettingsSidebar({ settings }: { settings: SettingsRegistry }) {
  const { t } = useTranslation<['settings-layout', ...TranslationNamespace[]]>(['settings-layout']);
  const entries = useSettingsEntries(settings);
  const groups = Map.groupBy(entries, entry => entry.group.id);
  return (
    <div className={styles.sidebar} data-settings-sidebar>
      <NavLink className={styles.returnLink} to="/">{t('settings.returnToApp')}</NavLink>
      <nav className={styles.menu} data-settings-menu aria-label={t('settings.title')}>
        {[...groups.values()].map(group => (
          <section key={group[0]!.group.id}>
            <h2>{groupLabelOf(group[0]!, t)}</h2>
            {group.map(entry => (
              <NavLink key={entry.id} className={styles.menuItem} to={`/settings/${entry.id}`}>
                {entry.Icon && createElement(entry.Icon, { size: 18 })}
                {labelOf(entry, t)}
              </NavLink>
            ))}
          </section>
        ))}
      </nav>
    </div>
  );
}

function SettingsFooterLink() {
  const { t } = useTranslation('settings-layout');
  return (
    <NavLink className={styles.footerLink} to="/settings">
      <Settings size={18} />
      {t('settings.title')}
    </NavLink>
  );
}

function labelOf(entry: ReturnType<SettingsRegistry['snapshot']>[number], t: (key: TranslationKey) => string) {
  return entry.labelKey ? t(entry.labelKey) : entry.label;
}

function groupLabelOf(entry: ReturnType<SettingsRegistry['snapshot']>[number], t: (key: TranslationKey) => string) {
  return entry.group.labelKey ? t(entry.group.labelKey) : entry.group.label;
}

function useSettingsEntries(settings: SettingsRegistry) {
  return useSyncExternalStore(settings.subscribe, settings.snapshot, settings.snapshot);
}
