import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { cordisWebBoot } from '@yunzhen/cordis-host-vite';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [
      cordisWebBoot({
        configPath: resolve(import.meta.dirname, 'cordis.yml'),
      }),
      react(),
    ],
  },
});
