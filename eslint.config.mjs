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
    // Prisma-generated client — machine output, not ours to lint.
    "src/generated/**",
  ]),
  {
    // Node CommonJS tooling scripts — these run under `node`, not the bundler,
    // so require() is correct here.
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Three.js / React Three Fiber components. R3F animates GPU buffers
    // imperatively (mutating typed arrays every frame, seeding with random
    // values, mount-gating the WebGL canvas) — patterns the React Compiler
    // purity/immutability rules can't model. Relaxed only for this directory.
    files: ["src/components/landing/**/*.tsx"],
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
]);

export default eslintConfig;
