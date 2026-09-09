/** Browser stand-in for the official Loader's only Node import. */
export function createRequire(): never {
  throw new Error('node:module is not available in the browser');
}

export type LoadHookContext = never;
