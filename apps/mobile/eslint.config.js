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
  },
  {
    // Node CommonJS tooling, not application code: these run under `node`, not
    // in the RN runtime. The Expo preset targets React Native and so declares
    // no CommonJS module-scope globals, which made `no-undef` fire on
    // publish-update.js's `__dirname`.
    //
    // Deliberately narrow. `no-undef` stays enabled everywhere, including here
    // -- this only teaches ESLint that two more identifiers legitimately exist
    // in this directory. `require`/`module`/`process` already resolve under the
    // base config, so they are not redeclared. Application files are untouched.
    files: ["scripts/*.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
]);
