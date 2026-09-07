/// <reference types="vite/client" />

declare module 'virtual:cordis-boot' {
  import type { PluginRegistry, WebBootGraph } from '@yunzhen/cordis-client-modules';

  export const graph: WebBootGraph;
  export const registry: PluginRegistry;
}
