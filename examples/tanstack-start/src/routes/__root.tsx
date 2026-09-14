import type { ReactNode } from 'react';
import type { PluginHost } from '../runtime';
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import { readRequestSnapshot } from '../seed';
import styles from '../styles.css?url';

export const Route = createRootRouteWithContext<{ plugins: PluginHost }>()({
  beforeLoad: async ({ context }) => {
    if (import.meta.env.SSR)
      await context.plugins.start(readRequestSnapshot());
  },
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: '收藏夹 · Cordis × TanStack Start' }],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  shellComponent: Document,
  component: Layout,
  errorComponent: ({ reset }) => (
    <main>
      <h1>页面暂时无法加载</h1>
      <button type="button" onClick={reset}>重试</button>
    </main>
  ),
  notFoundComponent: () => (
    <main>
      <h1>页面不存在</h1>
      <Link to="/">返回收藏夹</Link>
    </main>
  ),
});

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Layout() {
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          收藏夹
          <span>Cordis × TanStack Start</span>
        </Link>
        <nav aria-label="主导航">
          <Link to="/" activeOptions={{ exact: true }}>收藏</Link>
          <Link to="/about">关于示例</Link>
        </nav>
      </header>
      <main><Outlet /></main>
      <footer>整理值得再次打开的链接。</footer>
    </>
  );
}
