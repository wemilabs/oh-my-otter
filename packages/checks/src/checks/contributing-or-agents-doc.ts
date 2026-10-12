import { defineCheck } from "@oh-my-otter/core";
import { detectPackageManager, installCommand } from "../lib/package-manager";
import { packageScripts } from "../lib/scripts";

const guidanceFiles = [
  "CONTRIBUTING.md",
  ".github/CONTRIBUTING.md",
  "docs/CONTRIBUTING.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".cursor/rules/*",
  ".github/copilot-instructions.md",
  ".windsurfrules",
  "DEVELOPMENT.md",
  "HACKING.md",
];

export default defineCheck({
  id: "contributing-or-agents-doc",
  title: "Contributor or agent guidance",
  category: "docs",
  weight: 2,
  why: "Contributor instructions explain how an agent should work in the repository.",
  async run(ctx) {
    for (const file of guidanceFiles) {
      if ((await ctx.glob(file)).length > 0) {
        return { status: "pass", detail: `Found guidance file ${file}.` };
      }
    }
    return {
      status: "fail",
      detail: "No contributor or agent guidance file was found.",
      fix: "Add AGENTS.md with installation and development commands.",
    };
  },
  async fix(ctx) {
    const manager = await detectPackageManager(ctx);
    const scripts = packageScripts(ctx);
    const commands = Object.keys(scripts).map(
      (name) => `${manager} run ${name}`,
    );
    return [
      {
        path: "AGENTS.md",
        contents: `# Agent instructions\n\nInstall dependencies with \`${installCommand(manager)}\`.\n\nAvailable scripts:\n${commands.map((command) => `- \`${command}\``).join("\n")}\n`,
      },
    ];
  },
});
