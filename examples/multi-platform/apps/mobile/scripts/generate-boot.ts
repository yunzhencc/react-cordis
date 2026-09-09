import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import { renderWebBootVirtualModule } from '@react-cordis/vite';

const directory = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const graph = loadWebBootGraph(resolve(directory, 'cordis.yml'), undefined, {
  bundles: ['@examples/multi-platform-product'],
  patches: ['cordis.patch.yml'],
});
const source = renderWebBootVirtualModule(graph, (name) => {
  try {
    require.resolve(name);
    return true;
  }
  catch {
    return false;
  }
});
writeFileSync(resolve(directory, 'src/boot.generated.js'), `// Generated from Cordis configuration. Do not edit.\n${source}`);
