import type { Fiber, Plugin } from '@deepseek-ai/cordis';
import type {} from '@react-cordis/renderer';
import type { WebBootGraph } from './manifest';
import { Context } from '@deepseek-ai/cordis';
import { assertWebBootGraph } from './manifest';

export type PluginModule = Plugin.Object<unknown>;

export type PluginRegistry = ReadonlyMap<string, () => Promise<PluginModule>>;

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
  const created: { entryId: string; fiber: Fiber }[] = [];
  let stopped = false;

  try {
    await Promise.all(graph.entries.map(async (entry) => {
      const importer = registry.get(entry.name);
      if (!importer)
        throw new BootFailure(entry.id, 'registry', new Error(`registry entry missing for ${entry.name}`));

      let module: PluginModule;
      try {
        module = await importer();
      }
      catch (error) {
        throw new BootFailure(entry.id, 'import', error);
      }

      // Dynamic imports cannot be cancelled; ignore arrivals after boot has failed.
      if (stopped)
        return;
      try {
        const fiber = ctx.plugin(module, entry.config);
        created.push({ entryId: entry.id, fiber });
      }
      catch (error) {
        throw new BootFailure(entry.id, 'activate', error);
      }
    }));

    // A provider settling can start another fiber, so wait for the whole graph.
    while (true) {
      const tasks = created.flatMap(({ fiber }) => fiber.inertia ? [fiber.inertia] : []);
      if (tasks.length === 0)
        break;
      await Promise.all(tasks);
    }

    await Promise.all(created.map(async ({ entryId, fiber }) => {
      try {
        await fiber.await();
      }
      catch (error) {
        throw new BootFailure(entryId, 'activate', error);
      }
    }));
    for (const { entryId, fiber } of created) {
      // After lifecycle work settles, only a loaded fiber retains its service snapshot.
      if (fiber.uid !== null && fiber.store !== undefined)
        continue;
      const missing = Object.keys(fiber.inject).filter(name => fiber.ctx.get(name) === undefined);
      throw new BootFailure(entryId, 'activate', new Error(
        missing.length ? `missing services: ${missing.join(', ')}` : 'plugin did not become active',
      ));
    }
  }
  catch (error) {
    stopped = true;
    await disposeFibers(created.map(({ fiber }) => fiber));
    throw error;
  }

  return created.map(({ fiber }) => fiber);
}

export async function bootWebApp({ container, graph, registry }: BootWebAppOptions) {
  const ctx = new Context();
  let fibers: readonly Fiber[] = [];

  try {
    fibers = await activateWebBootGraph(ctx, graph, registry);
    const unmount = ctx.uiRenderer.mount(container);
    return async () => {
      unmount();
      await disposeFibers(fibers);
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
