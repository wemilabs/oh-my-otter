import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    bin: "src/bin.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: {
    compilerOptions: {
      customConditions: [],
      ignoreDeprecations: "6.0",
    },
  },
});
