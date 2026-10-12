import { randomBytes } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ingestIssue, agentsFileSchema } from "../dist/report.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const body = process.env.ISSUE_BODY ?? "";
  const author = process.env.ISSUE_AUTHOR ?? "";
  const issueNumber = Number(process.env.ISSUE_NUMBER ?? "0") || undefined;
  const githubOutput = process.env.GITHUB_OUTPUT;

  const agents = agentsFileSchema.parse(
    await readJson(path.join(root, "dataset", "agents.json")),
  );
  const cliPackage = await readJson(
    path.join(root, "packages", "cli", "package.json"),
  );
  const recent = process.env.RECENT_ISSUES_FILE
    ? await readJson(process.env.RECENT_ISSUES_FILE)
    : [];
  const open = process.env.OPEN_ISSUES_FILE
    ? await readJson(process.env.OPEN_ISSUES_FILE)
    : [];

  const result = ingestIssue({
    body,
    author,
    agents,
    latestCliVersion: cliPackage.version,
    recent,
    open,
    currentIssueNumber: issueNumber,
    now: new Date(),
  });

  if (githubOutput) {
    const delimiter = `omot-${randomBytes(8).toString("hex")}`;
    const lines = [
      `status=${result.ok ? "valid" : "invalid"}`,
      `line=${result.ok ? result.line : ""}`,
      `comment<<${delimiter}`,
      result.comment,
      delimiter,
    ];
    await appendFile(githubOutput, `${lines.join("\n")}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
