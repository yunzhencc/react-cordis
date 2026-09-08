const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Workspace packages also have React dependencies; Native must use Expo's exact React version.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/'))
    return { type: 'sourceFile', filePath: require.resolve(moduleName) };
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
