// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      "build/*",
      ".expo/*",
      "node_modules/*",
      "public/*",
      "shims/*",
      "scripts/*",
      "server/*",
      "expo-env.d.ts",
    ],
  },
  {
    rules: {
      // Prevent console.log/debug/info leaking into production builds.
      // console.error and console.warn are allowed for legitimate error reporting.
      // The Expo production build also strips consoles via babel-plugin-transform-remove-console.
      "no-console": ["error", { allow: ["error", "warn"] }],

      // React Native does not render to the DOM, so HTML entity escaping
      // (`'` -> `&apos;`, etc.) adds no value and only fights against natural
      // copy in user-facing strings. Disabled project-wide on purpose.
      "react/no-unescaped-entities": "off",

      // The codebase uses Platform.OS-gated `require("react-native-webview")`
      // and similar conditional native imports to keep web bundles slim.
      // The TypeScript compiler already enforces module shape; this rule's
      // dynamic-import preference fights that intentional pattern.
      "@typescript-eslint/no-require-imports": "off",

      // BASELINE FOR INITIAL SETUP: these two rules account for the vast
      // majority (260+) of pre-existing warnings in this app. Each warning
      // represents a real backlog item but resolving them all in this
      // setup task would be a sweeping behavioural change far outside its
      // scope. Burning the warnings down is tracked as a dedicated
      // follow-up task ("Clean up the lint warnings in the customer app")
      // which will re-enable both rules and add `--max-warnings 0` once
      // the codebase is clean.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);
