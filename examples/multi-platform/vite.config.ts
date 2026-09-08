import { resolve } from 'node:path';
import { cordisWebBoot } from '@react-cordis/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: { 'react-native': 'react-native-web' },
    extensions: ['.web.js', '.web.ts', '.web.tsx', '.mjs', '.js', '.ts', '.tsx', '.json'],
  },
  define: {
    '__DEV__': mode === 'development',
    'process.env.TAMAGUI_IS_CLIENT': 'true',
    'process.env.TAMAGUI_ENVIRONMENT': '"client"',
  },
  plugins: [
    cordisWebBoot({ configPath: 'web/cordis.yml', virtualModuleId: 'virtual:cordis-web', manifestFileName: 'web.boot.json' }),
    cordisWebBoot({ configPath: 'electron/cordis.yml', virtualModuleId: 'virtual:cordis-desktop', manifestFileName: 'electron/renderer.boot.json' }),
    react(),
  ],
  build: {
    rolldownOptions: {
      input: {
        web: resolve(import.meta.dirname, 'index.html'),
        desktop: resolve(import.meta.dirname, 'electron/index.html'),
      },
    },
  },
}));
