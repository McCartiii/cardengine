module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Required for react-native-worklets-core (Vision Camera frame processors)
      "react-native-worklets-core/plugin",
      // Reanimated must be listed last
      "react-native-reanimated/plugin",
    ],
  };
};
