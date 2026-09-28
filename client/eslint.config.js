// The standard's layering and AI Agent Mandatory Rules (section 19), enforced mechanically
// where a lint rule can express them. See docs/features/frontend-architecture.md.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Section 18 file-size ceilings, per layer. */
const maxLines = (max) => ["error", { max, skipBlankLines: false, skipComments: false }];

/** Only the transport layer may talk to the wire or to the identity SDK (sections 5, 19.1, 19.3). */
const transportOnly = [
  { name: "axios", message: "Only src/transport/ may import axios. Call a named endpoint function instead." },
];
const transportOnlyPatterns = [
  { group: ["firebase", "firebase/*"], message: "Only src/transport/ may import the Firebase SDK. Use useAuth()." },
];

/** UI code reaches data only through hooks (sections 6-9). */
const uiForbiddenPatterns = [
  ...transportOnlyPatterns,
  {
    group: ["**/endpoints/*"],
    message: "Components and pages never call endpoints. Use a feature hook (section 7).",
  },
  {
    group: ["**/transport/http", "**/transport/identity", "**/transport/*-identity"],
    message: "Components and pages never touch the transport layer. Use a hook.",
  },
];

export default defineConfig([
  globalIgnores(["dist", "coverage", "cypress/screenshots", "cypress/videos", "cypress/downloads"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    rules: {
      // Rule 19.7: no native browser dialogs. Use the Modal component or useToast().
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        { name: "alert", message: "Use useToast() (section 20)." },
        { name: "confirm", message: "Use the shared Modal (section 20)." },
        { name: "prompt", message: "Use the shared Modal with a form (section 20)." },
      ],
      "no-restricted-imports": ["error", { paths: transportOnly, patterns: transportOnlyPatterns }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs["recommended-latest"].rules,
  },
  {
    files: ["src/transport/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/components/**", "src/pages/**"],
    rules: { "no-restricted-imports": ["error", { paths: transportOnly, patterns: uiForbiddenPatterns }] },
  },
  {
    files: ["src/hooks/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: transportOnly,
          patterns: [
            ...transportOnlyPatterns,
            { group: ["**/transport/http"], message: "Hooks call endpoint functions, never httpClient (section 7)." },
          ],
        },
      ],
    },
  },
  { files: ["src/pages/**"], rules: { "max-lines": maxLines(1000) } },
  { files: ["src/components/**"], rules: { "max-lines": maxLines(700) } },
  { files: ["src/hooks/**"], rules: { "max-lines": maxLines(150) } },
  { files: ["src/endpoints/**"], rules: { "max-lines": maxLines(100) } },
  { files: ["src/utils/**"], rules: { "max-lines": maxLines(150) } },
  { files: ["src/contexts/**"], rules: { "max-lines": maxLines(200) } },
  {
    files: ["cypress/**", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]);
