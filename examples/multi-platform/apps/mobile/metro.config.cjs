const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const nodeModuleStub = require.resolve('@react-cordis/vite/node-module-stub');

config.transformer.babelTransformerPath = require.resolve('@react-cordis/vite/metro-transformer');
// Workspace packages also have React dependencies; Native must use Expo's exact React version.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/'))
    return { type: 'sourceFile', filePath: require.resolve(moduleName) };
  if (moduleName === 'node:module')
    return { type: 'sourceFile', filePath: nodeModuleStub };
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
