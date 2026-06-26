module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // O plugin de worklets do Reanimated 4 precisa ser o ÚLTIMO da lista.
    plugins: ['react-native-worklets/plugin'],
  };
};
