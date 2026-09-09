import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include';
import type { WebBootEntry, WebBootGraph } from '@react-cordis/boot/manifest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include';
import { assertWebBootEntry, assertWebBootGraph, sortWebBootEntries } from '@react-cordis/boot/manifest';
import { parseDocument } from 'yaml';

interface PackageManifest {
  exports?: unknown;
  cordis?: unknown;
  dsh?: unknown;
}

export interface WebBootConfigOptions {
  bundles?: readonly string[];
  patches?: readonly string[];
}

/** Bundle patches over [], then root entries, then application patches. App patch paths resolve beside configPath; bundle paths beside their manifest. */
export function loadWebBootGraph(configPath: string, onFile?: (path: string) => void, options: WebBootConfigOptions = {}): WebBootGraph {
  let rows: WebBootEntry[] = [];
  const patch = (path: string) => {
    const patches = readList(path, onFile);
    for (const value of patches) {
      if (!isRecord(value))
        throw new TypeError('web boot patch must be an object');
      assertFields(value, true);
      if (value.insert !== undefined) {
        if (!Array.isArray(value.insert))
          throw new TypeError('web boot patch insert must be an entry array');
        value.insert.forEach(validateRow);
      }
    }
    rows = applyEntryPatches(rows as Parameters<typeof applyEntryPatches>[0], patches as PatchOptions[], (message, ...args) => console.warn(message, ...args)) as WebBootEntry[];
  };
  for (const name of options.bundles ?? []) {
    const packagePath = findPackageJSON(name, pathToFileURL(configPath));
    if (!packagePath)
      throw new TypeError(`web boot bundle package not found: ${name}`);
    onFile?.(packagePath);
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8')) as PackageManifest;
    const bundle = isRecord(manifest.dsh) && manifest.dsh.bundle;
    if (!isRecord(bundle) || typeof bundle.patch !== 'string' || !bundle.patch)
      throw new TypeError(`web boot bundle requires dsh.bundle.patch: ${name}`);
    patch(resolve(dirname(packagePath), bundle.patch));
  }
  const root = readList(configPath, onFile);
  root.forEach(validateRow);
  rows.push(...root as WebBootEntry[]);
  for (const path of options.patches ?? []) patch(resolve(dirname(configPath), path));
  const entries = sortWebBootEntries(rows.map(value => loadEntry(value, configPath, onFile)));
  const graph = {
    revision: createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 12),
    entries,
  };
  assertWebBootGraph(graph);
  return graph;
}

function readList(path: string, onFile?: (path: string) => void): unknown[] {
  onFile?.(path);
  const source = readFileSync(path, 'utf8');
  if (/!!js(?:\/\S+)?\b/.test(source))
    throw new TypeError('web boot config rejects !!js tags');
  const document = parseDocument(source);
  if (document.errors.length || document.warnings.length)
    throw new TypeError(`web boot config YAML error: ${(document.errors[0] ?? document.warnings[0])!.message}`);
  const value: unknown = document.toJS();
  assertWebBootEntry({ id: 'input', name: 'input', dependencies: [], config: value as never });
  if (!Array.isArray(value))
    throw new TypeError('web boot config must be a top-level array');
  return value;
}

function assertFields(row: Record<string, unknown>, patch = false) {
  const allowed = ['id', 'name', 'config', 'disabled', 'group', 'inject', 'isolate', ...(patch ? ['insert'] : [])];
  for (const key of Object.keys(row)) {
    if (!allowed.includes(key))
      throw new TypeError(`web boot config unsupported entry field: ${key}`);
  }
}

function validateRow(value: unknown): asserts value is WebBootEntry {
  if (!isRecord(value))
    throw new TypeError('web boot config entry must be an object');
  assertFields(value);
  assertWebBootEntry({ ...value, dependencies: [] } as unknown as WebBootEntry);
  if (value.group)
    (value.config as unknown[]).forEach(validateRow);
}

function loadEntry(value: unknown, configPath: string, onFile?: (path: string) => void, parentDisabled = false): WebBootEntry {
  validateRow(value);
  const disabled = parentDisabled || !!value.disabled;
  if (value.group)
    return { ...value, dependencies: [], config: (value.config as WebBootEntry[]).map(row => loadEntry(row, configPath, onFile, disabled)) };
  if (disabled)
    return { ...value, dependencies: [] };
  const segments = value.name.split('/');
  const rootLength = value.name.startsWith('@') ? 2 : 1;
  const packageName = segments.slice(0, rootLength).join('/');
  const subpath = segments.length === rootLength ? '.' : `./${segments.slice(rootLength).join('/')}`;
  const manifest = loadPackageManifest(packageName, configPath, onFile);
  if (!hasRuntimeExport(manifest.exports, subpath))
    throw new TypeError(`web boot config ${subpath === '.' ? 'root' : subpath} export missing: ${value.name}`);
  if (manifest.cordis !== undefined && !isRecord(manifest.cordis))
    throw new TypeError(`web boot config cordis metadata must be an object: ${value.name}`);
  const dependencies = manifest.cordis?.inject;
  if (dependencies !== undefined && (!Array.isArray(dependencies) || dependencies.some(name => typeof name !== 'string')))
    throw new TypeError(`web boot config inject must be package names: ${value.name}`);
  return { ...value, dependencies: dependencies as string[] | undefined ?? [] };
}

function loadPackageManifest(name: string, configPath: string, onPackageManifest?: (path: string) => void): PackageManifest {
  const packagePath = findPackageJSON(name, pathToFileURL(configPath));
  if (!packagePath)
    throw new TypeError(`web boot config package not found: ${name}`);
  onPackageManifest?.(packagePath);
  return JSON.parse(readFileSync(packagePath, 'utf8')) as PackageManifest;
}

function hasRuntimeExport(exports: unknown, subpath: string) {
  const entry = subpath === '.' && (!isRecord(exports) || !Object.keys(exports).some(key => key.startsWith('.')))
    ? exports
    : isRecord(exports) ? exports[subpath] : undefined;
  return typeof entry === 'string' || (isRecord(entry) && typeof entry.default === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
