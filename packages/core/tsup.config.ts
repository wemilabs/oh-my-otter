import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    node: "src/node.ts",
  },
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: {
    compilerOptions: {
      customConditions: [],
    },
  },
});
