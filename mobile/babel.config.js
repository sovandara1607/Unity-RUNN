// Was missing entirely -- Metro fell back to the plain React Native babel
// preset, which skips babel-preset-expo's `'widget'`-directive transform
// (widgets/RaceLiveActivity.tsx's layout function needs to be rewritten into
// a source string before it reaches ActivityKit's native constructor; see
// the crash this fixed: "ArgumentCastException: The 2nd argument cannot be
// cast to type String"). Standard Expo boilerplate otherwise.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
