import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: '阅读角落 · Next.js + Cordis',
  description: '由 Cordis 插件提供的收藏清单，支持 Next.js 首屏渲染与客户端启停。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
