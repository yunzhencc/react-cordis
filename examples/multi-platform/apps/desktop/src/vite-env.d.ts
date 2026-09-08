declare module 'virtual:cordis-desktop' {
  import type { PluginRegistry, WebBootGraph } from '@react-cordis/boot';

  export const graph: WebBootGraph;
  export const registry: PluginRegistry;
}
declare module 'virtual:cordis-main' {
  export { graph, registry } from 'virtual:cordis-desktop';
}
