import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "public/**"],
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      // Block console.log and console.debug — these can leak debug output in production.
      // console.error and console.warn are permitted for error reporting.
      // Build-time stripping (esbuild.drop) is the production safety net;
      // this rule is the developer-facing gate that makes violations visible in CI.
      "no-console": ["error", { allow: ["error", "warn"] }],

      // Enforce correct hook dependency arrays to prevent stale closure bugs.
      "react-hooks/exhaustive-deps": "warn",
      // Enforce rules of hooks (call order, no conditionals) — violations are bugs.
      "react-hooks/rules-of-hooks": "error",
    },
  },
);
