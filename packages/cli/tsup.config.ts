import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    bin: "src/bin.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node20",
  clean: true,
  // Benchmarks is a private workspace package: bundle it so it is never published.
  noExternal: ["@oh-my-otter/benchmarks"],
  loader: { ".md": "text" },
  dts: {
    compilerOptions: {
      customConditions: [],
      ignoreDeprecations: "6.0",
    },
  },
});
