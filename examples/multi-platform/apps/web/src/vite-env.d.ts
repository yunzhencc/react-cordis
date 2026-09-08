declare module 'virtual:cordis-web' {
  import type { PluginRegistry, WebBootGraph } from '@react-cordis/boot';

  export const graph: WebBootGraph;
  export const registry: PluginRegistry;
}
