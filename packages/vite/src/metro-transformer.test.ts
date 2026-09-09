import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const transformer = require('./metro-transformer.cjs') as {
  getCacheKey?: () => string;
  transformLoaderSource: (source: string) => string;
};

it('rewrites only the official Loader dynamic import fallbacks', () => {
  const loaderPath = require.resolve('@deepseek-ai/cordis-plugin-loader');
  const source = readFileSync(loaderPath, 'utf8');
  const transformed = transformer.transformLoaderSource(source);

  expect(source.match(/await import\(/g)).toHaveLength(2);
  expect(transformed).not.toContain('await import(');
  expect(transformed.match(/await __cordisMetroDynamicImport\(/g)).toHaveLength(2);
  expect(transformed).toContain('this.ctx.loader.internal.import(name, this.ctx.baseUrl, {})');
  expect(transformed).toContain('this.parent.tree.import(candidate.name, this.getOuterStack)');
  expect(transformed).toContain('import(name, getOuterStack)');
});

it('replaces the Hermes-incompatible expression evaluator with a JSON-only failure', () => {
  const loaderPath = require.resolve('@deepseek-ai/cordis-plugin-loader');
  const transformed = transformer.transformLoaderSource(readFileSync(loaderPath, 'utf8'));
  const declaration = transformed.match(/const evaluate = \(\) => \{[^}]+\};/)?.[0];

  expect(transformed).not.toContain('new Function(');
  expect(transformed).not.toContain('with (ctx)');
  expect(declaration).toBeTruthy();
  expect(() => runInNewContext(`${declaration}\nevaluate({}, '1 + 1')`)).toThrow('Cordis browser platforms accept JSON-only plugin config');
  expect(transformed).toContain('value.map((item) => interpolate(ctx, item))');
  expect(transformed).toContain('valueMap(value, (item) => interpolate(ctx, item))');
});

it('forwards the Expo transformer cache key', () => {
  expect(transformer.getCacheKey).toBeTypeOf('function');
});
