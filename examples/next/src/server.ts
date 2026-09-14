import { notFound } from 'next/navigation';
import * as configuration from './boot.server.generated';
import { startPlugins } from './runtime';
import 'server-only';

export async function readSnapshot(list: string) {
  if (!['reading', 'tools', 'disabled'].includes(list))
    notFound();
  const items = list === 'tools'
    ? [{ title: 'Next.js', url: 'https://nextjs.org/' }, { title: 'TypeScript', url: 'https://www.typescriptlang.org/' }]
    : [{ title: 'React 官方文档', url: 'https://react.dev/' }, { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' }];
  const runtime = await startPlugins({ items, enabled: list !== 'disabled' }, configuration);
  try {
    return runtime.snapshot();
  }
  finally {
    await runtime.dispose();
  }
}
