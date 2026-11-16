// Metro setup for the monorepo: the app imports `@smart-reply/shared` from ../packages/shared.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const sharedRoot = path.resolve(repoRoot, 'packages/shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(repoRoot, 'node_modules')];
// One copy of these, whichever package asks for them.
config.resolver.extraNodeModules = {
  zod: path.resolve(projectRoot, 'node_modules/zod'),
  '@smart-reply/shared': sharedRoot
};

module.exports = config;
