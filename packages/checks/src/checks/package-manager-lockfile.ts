import { defineCheck } from "@oh-my-otter/core";
import {
  declaredPackageManager,
  lockfilesPresent,
} from "../lib/package-manager";

export default defineCheck({
  id: "package-manager-lockfile",
  title: "Package manager lockfile",
  category: "setup",
  weight: 5,
  why: "A matching lockfile lets an agent install reproducible dependencies.",
  async run(ctx) {
    if (!ctx.packageJson) {
      return {
        status: "fail",
        detail: "Root package.json is missing or invalid.",
        fix: "Add a package.json and commit the lockfile for your package manager.",
      };
    }
    const declared = declaredPackageManager(ctx);
    const present = await lockfilesPresent(ctx);
    const managers = Object.keys(present);
    if (declared) {
      if (!present[declared]) {
        return {
          status: "fail",
          detail: `No ${declared} lockfile found.`,
          fix: `Generate and commit a ${declared} lockfile.`,
        };
      }
      const mismatches = managers.filter((manager) => manager !== declared);
      if (mismatches.length > 0) {
        return {
          status: "fail",
          detail: `Declared ${declared}, but also found ${mismatches.join(", ")} lockfile(s).`,
          fix: `Keep only the ${declared} lockfile that matches package.json.`,
        };
      }
      return {
        status: "pass",
        detail: `${declared} lockfile matches package.json.`,
      };
    }
    if (managers.length === 1) {
      return { status: "pass", detail: `Found ${managers[0]} lockfile.` };
    }
    if (managers.length > 1) {
      return {
        status: "warn",
        detail: `Multiple lockfiles found: ${managers.join(", ")}.`,
        fix: "Choose one package manager and remove unrelated lockfiles.",
      };
    }
    return {
      status: "fail",
      detail: "No supported package-manager lockfile found.",
      fix: "Generate and commit a lockfile for your package manager.",
    };
  },
});
