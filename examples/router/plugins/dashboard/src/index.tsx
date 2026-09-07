import type { Context } from '@deepseek-ai/cordis';
import type {} from '@examples/router-app-layout';
import type {} from '@react-cordis/i18n';
import type {} from '@react-cordis/renderer';
import type {} from '@react-cordis/router';
import type {} from '@react-cordis/slots';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
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

function DashboardNavigation() {
  const { t } = useTranslation('dashboard');
  return <NavLink to="/">{t('dashboard.title')}</NavLink>;
}

export const inject = ['i18n', 'appLayout', 'routes', 'slots'];

const childSlots = { 'dashboard.workbench': { kind: 'single', scope: 'root' } } as const;

type DashboardSlots = typeof childSlots;

declare module '@react-cordis/slots' {
  interface SlotContracts extends DashboardSlots {}
}

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.register('dashboard', dashboardMessages));
  const { closeWorkbench, openWorkbench } = ctx.appLayout;
  ctx.slots.inject('sidebar.navigation', () => ctx.slots.register(
    { name: 'sidebar.navigation', id: 'dashboard', order: 0 },
    DashboardNavigation,
  ));
  ctx.slots.inject('dashboard.workbench', () => ctx.slots.inject('workbench', () => ctx.slots.register(
    { name: 'workbench' },
    DashboardWorkbench,
  )));
  ctx.routes.inject('app-layout', () => ctx.routes.register({
    id: 'dashboard',
    parentId: 'app-layout',
    index: true,
    Component: () => <DashboardPage closeWorkbench={closeWorkbench} openWorkbench={openWorkbench} />,
    children: childSlots,
  }));
}
