import { bootWebApp } from '@react-cordis/boot';
import { graph, registry } from 'virtual:cordis-boot';

void bootWebApp({
  container: document.getElementById('root')!,
  graph,
  registry,
}).catch(error => console.error(error));
