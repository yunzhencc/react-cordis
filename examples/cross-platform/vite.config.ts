import { resolve } from 'node:path';
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
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: {
        web: resolve(import.meta.dirname, 'index.html'),
        desktop: resolve(import.meta.dirname, 'electron/index.html'),
      },
    },
  },
}));
