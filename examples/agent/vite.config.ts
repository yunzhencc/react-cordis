import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { cordisWebBoot } from '@yunzhen/cordis-host-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [cordisWebBoot({ configPath: resolve(import.meta.dirname, 'cordis.yml'), virtualModuleId: 'virtual:cordis-example-agent-boot' }), react()],
});
