import { bootWebApp } from '@react-cordis/client-modules';
import { graph, registry } from 'virtual:cordis-boot';
import './style.css';

void bootWebApp({
  container: document.getElementById('root')!,
  graph,
  registry,
}).catch(error => console.error(error));
