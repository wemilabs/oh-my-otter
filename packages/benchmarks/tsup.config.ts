import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    report: "src/report/index.ts",
  },
  format: ["esm"],
  target: "node20",
  clean: true,
  loader: { ".md": "text" },
  dts: {
    compilerOptions: {
      customConditions: [],
      ignoreDeprecations: "6.0",
    },
  },
});
