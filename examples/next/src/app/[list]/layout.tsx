import type { ReactNode } from 'react';
import Link from 'next/link';
import { PluginProvider } from '../../plugin-provider';
import { readSnapshot } from '../../server';

// Every server render gets its own plugin runtime; only public seed data is used.
export const dynamic = 'force-dynamic';

export default async function ListLayout({ children, params }: { children: ReactNode; params: Promise<{ list: string }> }) {
  const { list } = await params;
  const initial = await readSnapshot(list);
  return (
    <PluginProvider key={list} initial={initial}>
      <header className="site-header">
        <Link className="brand" href={`/${list}`}>
          阅读角落
          <span>Next.js + Cordis</span>
        </Link>
        <nav aria-label="主导航">
          <Link href={`/${list}`}>我的清单</Link>
          <Link href={`/${list}/about`}>关于</Link>
        </nav>
      </header>
      <main>
        <nav className="seed-links" aria-label="示例清单">
          <Link href="/reading">阅读</Link>
          <Link href="/tools">工具</Link>
          <Link href="/disabled">初始停用</Link>
        </nav>
        {children}
      </main>
      <footer>收藏值得再读的内容。</footer>
    </PluginProvider>
  );
}
