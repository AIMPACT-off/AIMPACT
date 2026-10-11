export default ({ config }) => {
  const testBuild = process.env.APP_VARIANT === "test";
  const base = config || {};
  return {
    ...base,
    name: testBuild ? "AIMPACT TEST" : (base.name || "AIMPACT"),
    scheme: testBuild ? "aimpact-test" : (base.scheme || "aimpact"),
    ios: {
      ...(base.ios || {}),
      bundleIdentifier: testBuild ? "ai.aimpact.app.test" : (base.ios?.bundleIdentifier || "ai.aimpact.app")
    },
    android: {
      ...(base.android || {}),
      package: testBuild ? "ai.aimpact.app.test" : (base.android?.package || "ai.aimpact.app")
    },
    extra: {
      ...(base.extra || {}),
      appVariant: testBuild ? "test" : "production",
      isTestBuild: testBuild
    }
  };
};
