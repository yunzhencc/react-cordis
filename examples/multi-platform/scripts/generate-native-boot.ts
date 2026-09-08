import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWebBootGraph } from '@react-cordis/boot-config';
import { renderWebBootVirtualModule } from '@react-cordis/vite';

const directory = resolve(import.meta.dirname, '../native');
const graph = loadWebBootGraph(resolve(directory, 'cordis.yml'));
writeFileSync(resolve(directory, 'boot.generated.js'), `// Generated from cordis.yml. Do not edit.\n${renderWebBootVirtualModule(graph)}`);
