const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { enhanceMiddleware } = require('./scripts/dev-media-middleware');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve(
  'react-native-svg-transformer/expo',
);
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

// Dev only: serve ./dev-media/*.mp4 next to the bundle (see scripts/dev-media-middleware.js).
config.server = {
  ...config.server,
  enhanceMiddleware: enhanceMiddleware(path.join(__dirname, 'dev-media')),
};

module.exports = config;
