/// <reference types="vite/client" />

declare module 'virtual:cordis-boot' {
  import type { PluginRegistry, WebBootGraph } from '@react-cordis/client-modules';

  export const graph: WebBootGraph;
  export const registry: PluginRegistry;
}
