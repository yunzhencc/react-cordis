import { cordisWebBoot } from '@react-cordis/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom', 'react-i18next'],
    alias: { 'react-native': 'react-native-web' },
    extensions: ['.web.js', '.web.ts', '.web.tsx', '.mjs', '.js', '.ts', '.tsx', '.json'],
  },
  define: {
    '__DEV__': mode === 'development',
    'process.env.TAMAGUI_IS_CLIENT': 'true',
    'process.env.TAMAGUI_ENVIRONMENT': '"client"',
  },
  plugins: [cordisWebBoot({ bundles: ['@examples/multi-platform-product'], patches: ['cordis.patch.yml'], configPath: 'cordis.yml', virtualModuleId: 'virtual:cordis-desktop' }), react()],
  build: { outDir: 'dist/renderer' },
}));
