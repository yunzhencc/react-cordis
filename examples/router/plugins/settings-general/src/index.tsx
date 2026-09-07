import type { Context } from '@deepseek-ai/cordis';
import type {} from '@examples/router-settings-layout';
import type {} from '@react-cordis/i18n';
import type {} from '@react-cordis/renderer';
import { Slot } from '@react-cordis/renderer';
import { Settings } from 'lucide-react';
import styles from './index.module.css';

const messages = {
  zh: {
    general: { title: '常规' },
    settings: { groups: { personal: '个人' } },
  },
  en: {
    general: { title: 'General' },
    settings: { groups: { personal: 'Personal' } },
  },
} as const;

export const inject = ['i18n', 'settings', 'slots'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.register('settings-general', messages));
  ctx.settings.register({
    id: 'general',
    group: { id: 'personal', label: 'Personal', labelKey: 'common:settings.groups.personal', order: 100 },
    label: 'General',
    labelKey: 'settings-general:general.title',
    Icon: Settings,
    order: 0,
    Component: GeneralSettings,
    children: { 'settings.general.items': { kind: 'list', scope: 'root' } },
  });
}

function GeneralSettings() {
  return <div className={styles.content} data-settings-general><Slot name="settings.general.items" /></div>;
}
