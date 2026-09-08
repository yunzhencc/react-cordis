import { resolve } from 'node:path';
import process from 'node:process';
import { createJiti } from 'jiti';
import { build } from 'vite';

async function buildDesktop() {
  const { cordisWebBoot } = await createJiti(import.meta.url).import('@react-cordis/vite');
  for (const entry of ['main', 'preload']) {
    await build({
      configFile: false,
      plugins: entry === 'main'
        ? [cordisWebBoot({
            configPath: resolve(import.meta.dirname, 'cordis.main.yml'),
            virtualModuleId: 'virtual:cordis-main',
            manifestFileName: 'main.boot.json',
          })]
        : [],
      build: {
        target: 'node24',
        outDir: 'dist/host',
        emptyOutDir: entry === 'main',
        lib: {
          entry: resolve(import.meta.dirname, `${entry}.ts`),
          formats: [entry === 'main' ? 'es' : 'cjs'],
          fileName: () => `${entry}.${entry === 'main' ? 'mjs' : 'cjs'}`,
        },
        rolldownOptions: { external: ['electron', /^node:/] },
      },
    });
  }
}

buildDesktop().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
