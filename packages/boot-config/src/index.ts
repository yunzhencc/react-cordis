import type { JsonValue, WebBootEntry, WebBootGraph } from '@react-cordis/boot/manifest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { pathToFileURL } from 'node:url';
import { assertWebBootGraph, sortWebBootEntries } from '@react-cordis/boot/manifest';
import { parseDocument } from 'yaml';

interface BootConfigRow {
  id: unknown;
  name: unknown;
  disabled?: unknown;
  config?: unknown;
}

interface PackageManifest {
  exports?: unknown;
  cordis?: unknown;
}

/** Reports resolved manifests before reading them, including reads that fail. */
export function loadWebBootGraph(configPath: string, onPackageManifest?: (path: string) => void): WebBootGraph {
  const source = readFileSync(configPath, 'utf8');
  if (/!!js(?:\/\S+)?\b/.test(source))
    throw new TypeError('web boot config rejects !!js tags');

  const document = parseDocument(source);
  if (document.errors.length > 0)
    throw new TypeError(`web boot config YAML error: ${document.errors[0]!.message}`);

  const rows = document.toJS();
  if (!Array.isArray(rows))
    throw new TypeError('web boot config must be a top-level array');

  const entries = rows.flatMap((value, index) => loadEntry(value, index, configPath, onPackageManifest));
  const graph = {
    revision: createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0, 12),
    entries: sortWebBootEntries(entries),
  };
  assertWebBootGraph(graph);
  return graph;
}

function loadEntry(value: unknown, index: number, configPath: string, onPackageManifest?: (path: string) => void): WebBootEntry[] {
  if (!isRecord(value))
    throw new TypeError(`web boot config entry ${index} must be an object`);

  const row = value as unknown as BootConfigRow;
  if (row.disabled === true)
    return [];
  if (row.disabled !== undefined && typeof row.disabled !== 'boolean')
    throw new TypeError(`web boot config disabled must be boolean: ${index}`);
  if (typeof row.id !== 'string' || typeof row.name !== 'string')
    throw new TypeError(`web boot config entry ${index} requires id and name`);

  const segments = row.name.split('/');
  const rootLength = row.name.startsWith('@') ? 2 : 1;
  const packageName = segments.slice(0, rootLength).join('/');
  const subpath = segments.length === rootLength ? '.' : `./${segments.slice(rootLength).join('/')}`;
  const manifest = loadPackageManifest(packageName, configPath, onPackageManifest);
  if (!hasRuntimeExport(manifest.exports, subpath))
    throw new TypeError(`web boot config ${subpath === '.' ? 'root' : subpath} export missing: ${row.name}`);

  if (manifest.cordis !== undefined && !isRecord(manifest.cordis))
    throw new TypeError(`web boot config cordis metadata must be an object: ${row.name}`);
  const inject = manifest.cordis?.inject;
  if (inject !== undefined && (!Array.isArray(inject) || inject.some(name => typeof name !== 'string')))
    throw new TypeError(`web boot config inject must be package names: ${row.name}`);

  const config = parseJsonConfig(row.config, row.name);
  return [{
    id: row.id,
    name: row.name,
    inject: inject as readonly string[] | undefined ?? [],
    ...(config === undefined ? {} : { config }),
  }];
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

function parseJsonConfig(config: unknown, name: string) {
  if (config === undefined)
    return undefined;
  try {
    return JSON.parse(JSON.stringify(config)) as JsonValue;
  }
  catch {
    throw new TypeError(`web boot config value must be JSON-safe: ${name}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
