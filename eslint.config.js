// Purpose: Defines lint rules for Birbal source and test files.
// Scope: Keeps TypeScript style checks centralized for local development.

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["coverage/**", "data/**", "digests/**", "dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      eqeqeq: ["error", "always"],
      "no-duplicate-imports": [
        "error",
        {
          allowSeparateTypeImports: true,
        },
      ],
      "no-regex-spaces": "off",
      "no-undef": "off",
      "no-var": "error",
      "object-shorthand": "error",
      "preserve-caught-error": "off",
      "prefer-const": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
);
