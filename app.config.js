// Extends app.json. expo-notifications defaults its iOS aps-environment
// entitlement to "development" unless the plugin "mode" is set, which breaks
// background/lock-screen push delivery in preview/production builds signed
// with production profiles. Pick the mode from the EAS build profile so dev
// builds stay on the sandbox APNs environment and all other builds use
// production.
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE || "";
  const mode = profile === "development" ? "development" : "production";

  const plugins = (config.plugins || []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === "expo-notifications") {
      return ["expo-notifications", { ...(plugin[1] || {}), mode }];
    }
    return plugin;
  });

  return { ...config, plugins };
};
