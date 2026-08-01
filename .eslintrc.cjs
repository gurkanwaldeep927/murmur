/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: { node: true, es2022: true },
  ignorePatterns: ["dist/", "node_modules/", "client/dist/", "client/node_modules/", "docs/", "*.js"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
  overrides: [
    {
      // The PWA client (T10, T19). It was excluded outright until T19, which meant every
      // screen ported from Claude Design landed with no lint, no typecheck and no CI step
      // over it — the same blind spot that let two fatal SQL defects survive eleven days
      // (BUILD-NOTES 2026-08-01). It runs in a browser, not Node, so it needs its own env.
      files: ["client/src/**/*.ts"],
      env: { browser: true, node: false },
    },
  ],
};
