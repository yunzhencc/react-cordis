interface Window {
  galleryMedia: import('@yunzhen/gallery-formats').GalleryMediaApi;
  galleryPlugin: import('@yunzhen/gallery-formats').GalleryPluginApi;
}

declare module 'virtual:cordis-boot' {
  import type { PluginRegistry, WebBootGraph } from '@yunzhen/cordis-client-modules';

  export const graph: WebBootGraph;
  export const registry: PluginRegistry;
}
