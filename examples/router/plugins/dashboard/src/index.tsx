import type { Context } from '@deepseek-ai/cordis';
import type {} from '@examples/router-app-layout';
import type {} from '@react-cordis/i18n';
import type {} from '@react-cordis/renderer';
import type {} from '@react-cordis/router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { dashboardMessages } from './locales';

export function DashboardPage({ closeWorkbench, openWorkbench }: { closeWorkbench: () => void; openWorkbench: () => void }) {
  const { t } = useTranslation('dashboard');
  useEffect(() => () => closeWorkbench(), [closeWorkbench]);

  return (
    <>
      <h1>{t('dashboard.title')}</h1>
      <button type="button" onClick={openWorkbench}>{t('dashboard.openWorkbench')}</button>
    </>
  );
}

function DashboardWorkbench() {
  const { t } = useTranslation('dashboard');
  return (
    <section>
      <h2>{t('dashboard.workbenchTitle')}</h2>
      <p>{t('dashboard.description')}</p>
    </section>
  );
}

export const inject = ['i18n', 'appLayout', 'routes', 'slots'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.register('dashboard', dashboardMessages));
  const { closeWorkbench, openWorkbench } = ctx.appLayout;
  ctx.slots.inject('dashboard.workbench', () => ctx.slots.inject('workbench', () => ctx.slots.register(
    { name: 'workbench' },
    DashboardWorkbench,
  )));
  ctx.routes.inject('app-layout', () => ctx.routes.register({
    id: 'dashboard',
    parentId: 'app-layout',
    index: true,
    Component: () => <DashboardPage closeWorkbench={closeWorkbench} openWorkbench={openWorkbench} />,
    children: { 'dashboard.workbench': { kind: 'single', scope: 'root' } },
    navigation: { label: 'Dashboard', labelKey: 'dashboard:dashboard.title', order: 0 },
  }));
}
