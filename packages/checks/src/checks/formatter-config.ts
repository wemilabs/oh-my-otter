import { defineCheck } from "@oh-my-otter/core";

const prettierPatterns = [".prettierrc*", "prettier.config.*"];
const formatterFiles = [
  "biome.json",
  "biome.jsonc",
  "dprint.json",
  ".dprint.json",
];

export default defineCheck({
  id: "formatter-config",
  title: "Formatter configuration",
  category: "hygiene",
  weight: 2,
  why: "A formatter configuration keeps agent-authored code consistent with the project.",
  async run(ctx) {
    for (const pattern of prettierPatterns) {
      if ((await ctx.glob(pattern)).length > 0) {
        return {
          status: "pass",
          detail: "A Prettier configuration was found.",
        };
      }
    }
    for (const file of formatterFiles) {
      if (await ctx.exists(file)) {
        return { status: "pass", detail: `Found ${file}.` };
      }
    }
    for (const file of ["deno.json", "deno.jsonc"]) {
      const contents = await ctx.read(file);
      if (contents) {
        try {
          const config: unknown = JSON.parse(contents);
          if (
            config !== null &&
            typeof config === "object" &&
            !Array.isArray(config) &&
            "fmt" in config
          ) {
            return {
              status: "pass",
              detail: `${file} configures Deno formatting.`,
            };
          }
        } catch {
          if (/"fmt"\s*:/.test(contents)) {
            return {
              status: "pass",
              detail: `${file} configures Deno formatting.`,
            };
          }
        }
      }
    }
    if (await ctx.exists(".editorconfig")) {
      return {
        status: "warn",
        detail:
          "Only .editorconfig was found; it does not replace a formatter config.",
        fix: "Add a formatter config such as .prettierrc.json and install Prettier.",
      };
    }
    return {
      status: "fail",
      detail: "No formatter configuration was found.",
      fix: "Add a formatter config such as .prettierrc.json and install Prettier.",
    };
  },
  async fix() {
    return [{ path: ".prettierrc.json", contents: "{}\n" }];
  },
});
