const { withXcodeProject } = require('@expo/config-plugins');

// Expo's generated Xcode project defaults every target's CODE_SIGN_IDENTITY
// to "-" (ad-hoc "Sign to Run Locally"), which is normally exactly right for
// a plain RN app on Simulator -- no Apple account needed, nothing to
// provision. But ad-hoc signing silently DROPS any entitlement that needs a
// provisioning profile (App Groups, Push Notifications) even when a
// DEVELOPMENT_TEAM is set: `codesign -d --entitlements` on an ad-hoc-signed
// build comes back an empty <dict/>, regardless of what's in the .entitlements
// file on disk. expo-widgets' Live Activity <-> widget-extension bridge is
// entirely App-Group-based (see expo-widgets/ios/WidgetsStorage.swift --
// UserDefaults(suiteName:) silently returns nil without it), so this app
// needs real "Apple Development" signing even for local Simulator runs, or
// a Live Activity starts (ActivityKit doesn't care) but the widget extension
// has nothing to render.
module.exports = function withRealCodeSignIdentity(config) {
  return withXcodeProject(config, (config) => {
    config.modResults.updateBuildProperty('CODE_SIGN_IDENTITY', '"Apple Development"');
    config.modResults.updateBuildProperty('CODE_SIGN_STYLE', 'Automatic');
    return config;
  });
};
