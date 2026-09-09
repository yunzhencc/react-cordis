const loaderSegment = '/@deepseek-ai/cordis-plugin-loader/';
const evaluatorReplacement = 'const evaluate = () => { throw new Error("Cordis browser platforms accept JSON-only plugin config") };';
// This adapter is pinned to the published Loader declaration. Update the
// pattern and replacement together when upgrading that package.
const evaluatePattern = /const evaluate = new Function\("ctx", "expr", `[\s\S]*?`\);/;

exports.isOfficialLoaderPath = id => id.replaceAll('\\', '/').includes(loaderSegment);

exports.removeEagerLoaderEvaluator = (source) => {
  if (source.includes(evaluatorReplacement))
    return source;
  const transformed = source.replace(evaluatePattern, evaluatorReplacement);
  if (transformed === source)
    throw new Error('Cordis browser transform could not locate the official Loader expression evaluator');
  return transformed;
};
