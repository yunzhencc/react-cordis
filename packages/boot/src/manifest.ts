import { isJsonValue } from '@deepseek-ai/dsh-util-values';

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface WebBootEntry {
  id: string;
  name: string;
  /** Package metadata dependencies, distinct from Loader service injection. */
  dependencies: readonly string[];
  inject?: readonly string[] | Readonly<Record<string, JsonValue>> | null;
  isolate?: Readonly<Record<string, true | string>> | null;
  group?: boolean | null;
  disabled?: boolean | null;
  config?: JsonValue | readonly WebBootEntry[];
}

export interface WebBootGraph {
  revision: string;
  entries: readonly WebBootEntry[];
}

export function flattenWebBootEntries(entries: readonly WebBootEntry[]): WebBootEntry[] {
  return entries.flatMap(entry => [entry, ...(entry.group && Array.isArray(entry.config) ? flattenWebBootEntries(entry.config as WebBootEntry[]) : [])]);
}

export function assertWebBootGraph(graph: WebBootGraph): asserts graph is WebBootGraph {
  if (!graph || typeof graph.revision !== 'string' || !Array.isArray(graph.entries))
    throw new TypeError('web boot graph must contain a revision and entries');
  sortWebBootEntries(graph.entries);
}

/** Preserve tree boundaries while ordering package dependencies within each group. */
export function sortWebBootEntries(entries: readonly WebBootEntry[]): WebBootEntry[] {
  const ids = new Set<string>();
  for (const entry of flattenWebBootEntries(entries)) {
    assertWebBootEntry(entry);
    if (ids.has(entry.id))
      throw new TypeError(`web boot graph duplicate id: ${entry.id}`);
    ids.add(entry.id);
  }
  const sort = (rows: readonly WebBootEntry[], ancestors: ReadonlySet<string>, disabled = false): WebBootEntry[] => {
    const byName = new Map<string, WebBootEntry>();
    for (const entry of rows) {
      if (disabled || entry.disabled || entry.group)
        continue;
      if (byName.has(entry.name))
        throw new TypeError(`web boot graph duplicate package: ${entry.name}`);
      byName.set(entry.name, entry);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const sorted: WebBootEntry[] = [];
    const visit = (entry: WebBootEntry, path: readonly string[]) => {
      if (visited.has(entry.id))
        return;
      if (visiting.has(entry.id))
        throw new TypeError(`web boot graph cycle: ${[...path, entry.name].join(' -> ')}`);
      visiting.add(entry.id);
      if (!disabled && !entry.disabled) {
        for (const dependency of entry.dependencies) {
          const target = byName.get(dependency);
          if (target)
            visit(target, [...path, entry.name]);
          else if (!ancestors.has(dependency))
            throw new TypeError(`web boot graph injects inactive package: ${entry.name} -> ${dependency}`);
        }
      }
      visiting.delete(entry.id);
      visited.add(entry.id);
      sorted.push(entry.group ? { ...entry, config: sort(entry.config as WebBootEntry[], new Set([...ancestors, ...byName.keys()]), disabled || !!entry.disabled) } : entry);
    };
    for (const entry of rows) visit(entry, []);
    return sorted;
  };
  return sort(entries, new Set());
}

export function assertWebBootEntry(entry: WebBootEntry) {
  if (!entry || typeof entry.id !== 'string' || entry.id.length === 0)
    throw new TypeError('web boot graph entry id must be a non-empty string');
  if (typeof entry.name !== 'string' || entry.name.length === 0)
    throw new TypeError('web boot graph entry name must be a non-empty string');
  if (entry.name.startsWith('cordis:') && entry.name !== 'cordis:group')
    throw new TypeError(`web boot graph unsupported builtin: ${entry.name}`);
  const fields = new Set(['id', 'name', 'dependencies', 'config', 'group', 'disabled', 'inject', 'isolate']);
  for (const key of Object.keys(entry)) {
    if (!fields.has(key))
      throw new TypeError(`web boot graph unsupported entry field: ${key}`);
  }
  if (!Array.isArray(entry.dependencies) || entry.dependencies.some(name => typeof name !== 'string'))
    throw new TypeError(`web boot graph dependencies must be package names: ${entry.name}`);
  for (const key of ['group', 'disabled'] as const) {
    if (entry[key] != null && typeof entry[key] !== 'boolean')
      throw new TypeError(`web boot graph ${key} must be boolean: ${entry.name}`);
  }
  if (entry.inject != null && (!isJsonValue(entry.inject) || (Array.isArray(entry.inject) ? entry.inject.some(name => typeof name !== 'string') : typeof entry.inject !== 'object')))
    throw new TypeError(`web boot graph inject must be service names or service config: ${entry.name}`);
  if (entry.isolate != null && (!isJsonValue(entry.isolate) || typeof entry.isolate !== 'object' || Array.isArray(entry.isolate) || Object.values(entry.isolate).some(value => value !== true && typeof value !== 'string')))
    throw new TypeError(`web boot graph isolate must map services to true or labels: ${entry.name}`);
  if (entry.group && (entry.name !== 'cordis:group' || !Array.isArray(entry.config)))
    throw new TypeError('web boot graph groups require name cordis:group and an entry-array config');
  if (!entry.group && entry.name === 'cordis:group')
    throw new TypeError('web boot graph cordis:group requires group: true');
  if (entry.config !== undefined && !isJsonValue(entry.config))
    throw new TypeError(`web boot graph config must be JSON-safe: ${entry.name}`);
  for (const value of [entry.config, entry.inject, entry.isolate]) rejectExpressions(value);
}

/** Loader interprets these JSON-shaped objects as executable expressions. */
function rejectExpressions(value: unknown) {
  if (!value || typeof value !== 'object')
    return;
  if ('__jsExpr' in value)
    throw new TypeError('web boot graph rejects !!js expression objects');
  Object.values(value).forEach(rejectExpressions);
}
