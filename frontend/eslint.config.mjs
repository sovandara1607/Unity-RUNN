import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Existing Phase 7 pages still contain loosely typed API/view-model
      // edges. Keep them visible as warnings while allowing CI to enforce
      // correctness rules and incrementally replace them with domain types.
      "@typescript-eslint/no-explicit-any": "warn",
      // Async data-loading effects intentionally update local page state.
      // exhaustive-deps continues to flag unstable dependencies.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Vendored ai-elements registry components, not hand-written.
    files: ["src/components/ai-elements/**"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/static-components": "off",
    },
  },
]);

export default eslintConfig;
