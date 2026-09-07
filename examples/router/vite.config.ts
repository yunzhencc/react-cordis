import type { ThemeConfig } from '@react-cordis/theme';
import { resolve } from 'node:path';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import { getThemeScript } from '@react-cordis/theme/theme';
import { cordisWebBoot } from '@react-cordis/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    cordisWebBoot(),
    {
      name: 'router-theme-bootstrap',
      transformIndexHtml: {
        order: 'pre',
        handler() {
          const graph = loadWebBootGraph(resolve(import.meta.dirname, 'cordis.yml'));
          const theme = graph.entries.find(entry => entry.name === '@react-cordis/theme');
          if (!theme)
            return [];
          return [{
            tag: 'script',
            children: getThemeScript(theme.config as ThemeConfig | undefined),
            injectTo: 'head-prepend',
          }];
        },
      },
    },
    react(),
  ],
});
