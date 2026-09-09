import type { Fiber, FiberState, Plugin } from '@deepseek-ai/cordis';
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import type {} from '@react-cordis/renderer';
import type { WebBootEntry, WebBootGraph } from './manifest';
import { Context } from '@deepseek-ai/cordis';
import Group from '@deepseek-ai/cordis-plugin-group';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import { assertWebBootGraph } from './manifest';

export type PluginModule = Plugin.Object<unknown>;

export type PluginRegistry = ReadonlyMap<string, () => Promise<PluginModule>>;

// Cordis publishes FiberState as a const enum, with no runtime export.
const ACTIVE = 2 satisfies FiberState;
const FAILED = 3 satisfies FiberState;

export interface BootWebAppOptions {
  container: HTMLElement;
  graph: WebBootGraph;
  registry: PluginRegistry;
}

export class BootFailure extends Error {
  constructor(
    readonly entryId: string,
    readonly stage: 'registry' | 'import' | 'activate',
    cause: unknown,
  ) {
    super(`web boot ${stage} failed for ${entryId}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

export async function activateWebBootGraph(ctx: Context, graph: WebBootGraph, registry: PluginRegistry) {
  assertWebBootGraph(graph);
  if (ctx.get('loader'))
    throw new BootFailure('loader', 'activate', new Error('this context already owns a Loader'));
  const loaderFiber = ctx.plugin(Loader);
  let stopped = false;
  let starting = true;
  let fail!: (error: BootFailure) => void;
  const failure = new Promise<never>((_, reject) => {
    fail = reject;
  });
  // An import can fail before the initial create() calls have returned.
  void failure.catch(() => {});
  try {
    await loaderFiber;
    const loader = ctx.loader;
    loader.builtins.group = Group;
    // Official Loader owns entry lifecycle; the bundler registry owns code arrival.
    loader.internal = {
      import: async (name: string) => {
        const candidates = starting ? moduleEntries(graph.entries, name) : [];
        const entryId = candidates.length === 1 ? candidates[0]! : name;
        const importer = registry.get(name);
        try {
          if (!importer)
            throw new BootFailure(entryId, 'registry', new Error(`registry entry missing for ${name}`));
          const module = await importer();
          if (stopped)
            throw new Error('boot has stopped');
          return module;
        }
        catch (cause) {
          const detail = candidates.length > 1
            ? new Error(`module ${name}, configured candidate entries: ${candidates.join(', ')}: ${String(cause)}`, { cause })
            : cause;
          const error = cause instanceof BootFailure ? cause : new BootFailure(entryId, 'import', detail);
          fail(error);
          throw error;
        }
      },
    } as unknown as Loader['internal'];
    const stopWatching = loader.ctx.on('internal/status', (fiber) => {
      if (fiber.state !== FAILED || !fiber.entry)
        return;
      void fiber.await().catch(cause => fail(new BootFailure(fiber.entry!.id, 'activate', cause)));
    });
    const startup = Promise.all(graph.entries.map(async (entry) => {
      try {
        await loader.create(loaderEntry(entry));
      }
      catch (cause) {
        throw new BootFailure(entry.id, 'activate', cause);
      }
    })).then(() => loader.await());
    await Promise.race([startup, failure]);
    for (const entry of loader.entries()) {
      if (entry.disabled)
        continue;
      const fiber = entry.fiber;
      if (fiber?.state === ACTIVE)
        continue;
      const missing = fiber ? Object.keys(fiber.inject).filter(name => fiber.ctx.get(name) === undefined) : [];
      throw new BootFailure(entry.id, 'activate', new Error(
        missing.length ? `missing services: ${missing.join(', ')}` : 'plugin did not become active',
      ));
    }
    stopWatching();
    starting = false;
  }
  catch (error) {
    stopped = true;
    await loaderFiber.dispose();
    throw error;
  }
  // The Loader fiber owns the complete entry tree, including nested groups.
  return [loaderFiber];
}

function moduleEntries(entries: readonly WebBootEntry[], name: string): string[] {
  return entries.flatMap(entry => entry.disabled
    ? []
    : entry.group
      ? moduleEntries(entry.config as readonly WebBootEntry[], name)
      : entry.name === name ? [entry.id] : []);
}

function loaderEntry(entry: WebBootEntry): EntryOptions {
  const { dependencies: _, ...options } = entry;
  return {
    ...options,
    ...(entry.group ? { config: (entry.config as unknown as WebBootEntry[]).map(loaderEntry) } : {}),
  };
}

export async function bootWebApp({ container, graph, registry }: BootWebAppOptions) {
  const ctx = new Context();
  let fibers: readonly Fiber[] = [];

  try {
    fibers = await activateWebBootGraph(ctx, graph, registry);
    const unmount = ctx.uiRenderer.mount(container);
    return async () => {
      try {
        unmount();
      }
      finally {
        await disposeFibers(fibers);
      }
    };
  }
  catch (error) {
    await disposeFibers(fibers);
    const failure = error instanceof BootFailure ? error : new BootFailure('unknown', 'activate', error);
    renderBootFailure(container, failure);
    throw failure;
  }
}

export function renderBootFailure(container: HTMLElement, failure: BootFailure) {
  const alert = document.createElement('pre');
  alert.setAttribute('role', 'alert');
  alert.textContent = failure.message;
  container.replaceChildren(alert);
}

async function disposeFibers(fibers: readonly Fiber[]) {
  for (const fiber of [...fibers].reverse()) await fiber.dispose();
}
