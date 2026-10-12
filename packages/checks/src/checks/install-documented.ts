import { defineCheck } from "@oh-my-otter/core";
import { findReadme } from "../lib/readme";
import { detectPackageManager, installCommand } from "../lib/package-manager";

const setupHeading =
  /^#{1,6}\s+.*(?:install|setup|set up|getting started|quick ?start|development)/im;
const installCommandPattern =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|ci|add)\b|\byarn\b|\b(?:npx|corepack|bunx)\b/i;

export default defineCheck({
  id: "install-documented",
  title: "Installation documented",
  category: "docs",
  weight: 4,
  why: "Documented installation steps let an agent set up the repository reliably.",
  async run(ctx) {
    const readme = await findReadme(ctx);
    if (!readme) {
      return {
        status: "fail",
        detail: "No root README was found.",
        fix: "Add a README with an installation section and command.",
      };
    }
    const contents = (await ctx.read(readme)) ?? "";
    const hasHeading = setupHeading.test(contents);
    const hasCommand = installCommandPattern.test(contents);
    if (hasHeading && hasCommand) {
      return { status: "pass", detail: `${readme} documents installation.` };
    }
    if (hasHeading || hasCommand) {
      return {
        status: "warn",
        detail: `${readme} is missing an installation heading or runnable command.`,
        fix: "Add an installation section and a runnable package-manager command.",
      };
    }
    return {
      status: "fail",
      detail: `${readme} has no installation guidance.`,
      fix: "Add an installation section and a runnable package-manager command.",
    };
  },
  async fix(ctx) {
    if (await findReadme(ctx)) return [];
    const manager = await detectPackageManager(ctx);
    return [
      {
        path: "README.md",
        contents: `# Project\n\n## Getting started\n\n\`\`\`sh\n${installCommand(manager)}\n\`\`\`\n`,
      },
    ];
  },
});
