import type { PluginSnapshot } from './runtime';
import { createServerOnlyFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

export const readRequestSnapshot = createServerOnlyFn((): PluginSnapshot => {
  const params = new URL(getRequest().url).searchParams;
  return {
    enabled: params.get('disabled') !== '1',
    items: params.get('list') === 'tools'
      ? [{ title: 'Vite 构建工具', url: 'https://vite.dev/' }, { title: 'TanStack Start', url: 'https://tanstack.com/start' }]
      : [{ title: 'React 官方文档', url: 'https://react.dev/' }, { title: 'TypeScript 手册', url: 'https://www.typescriptlang.org/docs/' }],
  };
});
