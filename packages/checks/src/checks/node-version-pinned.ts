import { defineCheck } from "@oh-my-otter/core";
import { DEFAULT_NODE_MAJOR } from "../lib/node-version";

export default defineCheck({
  id: "node-version-pinned",
  title: "Node.js version pinned",
  category: "setup",
  weight: 3,
  why: "A declared Node.js version prevents agents from using an incompatible runtime.",
  async run(ctx) {
    for (const file of [".nvmrc", ".node-version"]) {
      const contents = await ctx.read(file);
      if (contents?.trim()) {
        return { status: "pass", detail: `${file} pins the Node.js version.` };
      }
    }
    const toolVersions = await ctx.read(".tool-versions");
    if (toolVersions && /^\s*(?:nodejs|node)\s+\S+/m.test(toolVersions)) {
      return {
        status: "pass",
        detail: ".tool-versions pins the Node.js version.",
      };
    }
    const engines = ctx.packageJson?.engines;
    const nodeEngine =
      engines !== null && typeof engines === "object" && !Array.isArray(engines)
        ? (engines as Record<string, unknown>).node
        : undefined;
    if (typeof nodeEngine === "string" && nodeEngine.trim()) {
      return { status: "pass", detail: "package.json engines.node is set." };
    }
    const volta = ctx.packageJson?.volta;
    const voltaNode =
      volta !== null && typeof volta === "object" && !Array.isArray(volta)
        ? (volta as Record<string, unknown>).node
        : undefined;
    if (typeof voltaNode === "string" && voltaNode.trim()) {
      return { status: "pass", detail: "package.json volta.node is set." };
    }
    return {
      status: "fail",
      detail: "No Node.js version pin was found.",
      fix: "Pin a Node.js version in .nvmrc or package.json.",
    };
  },
  async fix() {
    return [{ path: ".nvmrc", contents: `${DEFAULT_NODE_MAJOR}\n` }];
  },
});
