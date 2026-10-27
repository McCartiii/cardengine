module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo adds the Reanimated (react-native-worklets) plugin itself.
    presets: ["babel-preset-expo"],
    plugins: [
      // Required for react-native-worklets-core (Vision Camera frame processors)
      "react-native-worklets-core/plugin",
    ],
  };
};
