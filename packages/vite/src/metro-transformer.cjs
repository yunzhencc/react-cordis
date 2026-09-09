const { sep } = require('node:path');
const process = require('node:process');
const { removeEagerLoaderEvaluator } = require('./loader-browser-source.cjs');

const expoConfigPath = require.resolve('expo/metro-config', { paths: [process.cwd()] });
const { getDefaultConfig } = require(expoConfigPath);
const defaultTransformer = require(getDefaultConfig(process.cwd()).transformer.babelTransformerPath);
const loaderSegment = `${sep}@deepseek-ai${sep}cordis-plugin-loader${sep}`;

Object.assign(exports, defaultTransformer);

exports.transformLoaderSource = (source) => {
  const withoutEvaluator = removeEagerLoaderEvaluator(source);
  return `const __cordisMetroDynamicImport = () => Promise.reject(new Error("Cordis Metro requires a static loader registry"));\n${withoutEvaluator
    .replaceAll('process.versions.node', '"0.0.0"')
    .replaceAll('process.execArgv', '[]')
    .replaceAll('process.env.CORDIS_SHARED', 'undefined')
    .replaceAll('await import(', 'await __cordisMetroDynamicImport(')}`;
};

exports.transform = async (args) => {
  if (!args.filename.includes(loaderSegment))
    return defaultTransformer.transform(args);

  return defaultTransformer.transform({
    ...args,
    src: exports.transformLoaderSource(args.src),
  });
};
