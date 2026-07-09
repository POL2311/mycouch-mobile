const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Enable CSS Module support for NativeWind v4
module.exports = withNativeWind(config, {
  input: "./global.css",
  // Enables the experimental CSS support in Metro for web target
  inlineRem: 16,
});
