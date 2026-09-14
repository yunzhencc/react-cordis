/// <reference types="vite/client" />

declare module 'virtual:cordis-boot' {
  import type { PluginRegistry, WebBootGraph } from '@react-cordis/boot';

  export const graph: WebBootGraph;
  export const registry: PluginRegistry;
}
