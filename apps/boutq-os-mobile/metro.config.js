const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ignore temporary dot folders created in node_modules on Windows to prevent file watcher errors
config.resolver.blockList = [
  /.*[/\\]node_modules[/\\]\..*/,
  /.*[/\\]node_modules[/\\]@expo[/\\]\..*/,
  /.*\.fingerprint.*/,
  /.*\.possible.*/,
];

module.exports = config;
