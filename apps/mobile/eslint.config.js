// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // React Native text is not HTML; natural apostrophes/quotes in copy do
      // not need entity escaping and should not block the mobile lint gate.
      "react/no-unescaped-entities": "off",
    },
  }
]);
