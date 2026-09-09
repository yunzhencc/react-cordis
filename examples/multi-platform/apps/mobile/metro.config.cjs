const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const nodeModuleStub = require.resolve('@react-cordis/vite/node-module-stub');

config.transformer.babelTransformerPath = require.resolve('@react-cordis/vite/metro-transformer');
// Keep Expo's React version and one react-i18next Context across workspace packages.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/') || moduleName === 'react-i18next')
    return { type: 'sourceFile', filePath: require.resolve(moduleName) };
  if (moduleName === 'node:module')
    return { type: 'sourceFile', filePath: nodeModuleStub };
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
