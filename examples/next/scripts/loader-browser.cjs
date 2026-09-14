const { removeEagerLoaderEvaluator } = require('@react-cordis/vite/loader-browser-source');

module.exports = source => removeEagerLoaderEvaluator(source)
  .replaceAll('process.versions.node', '"0.0.0"')
  .replaceAll('process.execArgv', '[]')
  .replaceAll('process.env.CORDIS_SHARED', 'undefined');
