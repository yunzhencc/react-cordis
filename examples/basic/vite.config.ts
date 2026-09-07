import react from '@vitejs/plugin-react';
import { cordisWebBoot } from '@yunzhen/cordis-host-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [cordisWebBoot(), react()],
});
