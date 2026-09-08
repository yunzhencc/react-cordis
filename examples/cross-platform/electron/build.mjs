import { resolve } from 'node:path';
import process from 'node:process';
import { build } from 'vite';

async function buildDesktop() {
  for (const entry of ['main', 'preload']) {
    await build({
      configFile: false,
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
