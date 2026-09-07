import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { beforeAll, expect, it } from 'vitest';

let html: string;
beforeAll(async () => {
  const result = await build({ root: import.meta.dirname, logLevel: 'silent', build: { write: false } });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(result => 'output' in result ? result.output : []);
  const asset = outputs.find(output => output.type === 'asset' && output.fileName === 'index.html');
  if (!asset || asset.type !== 'asset')
    throw new Error('built index.html missing');
  html = String(asset.source);
});

it('initializes the legacy theme before modules load', () => {
  const dom = new JSDOM(html, {
    url: 'https://example.test',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.localStorage.setItem('@yunzhen/cordis-ui-theme:preference', 'dark');
      window.matchMedia = (() => ({ matches: false })) as typeof window.matchMedia;
    },
  });
  try {
    const root = dom.window.document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(dom.window.document.head.querySelector('script:not([type])')).not.toBeNull();
    expect(dom.window.document.head.querySelector('link[rel="stylesheet"]')).not.toBeNull();
  }
  finally { dom.window.close(); }
});
