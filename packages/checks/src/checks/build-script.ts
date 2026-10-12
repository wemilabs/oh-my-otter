import { defineCheck } from "@oh-my-otter/core";
import { packageScripts } from "../lib/scripts";

export default defineCheck({
  id: "build-script",
  title: "Build script",
  category: "verification",
  weight: 4,
  why: "A build command lets an agent validate production compilation.",
  async run(ctx) {
    return packageScripts(ctx).build
      ? { status: "pass", detail: "A scripts.build command is configured." }
      : {
          status: "fail",
          detail: "No scripts.build command was found.",
          fix: "Add a build script to package.json.",
        };
  },
});
