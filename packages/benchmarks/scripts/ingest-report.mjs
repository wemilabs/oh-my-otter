import { randomBytes } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ingestIssue, agentsFileSchema } from "../dist/report.js";
import { writeIngestResult } from "../dist/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

async function main() {
  const body = process.env.ISSUE_BODY ?? "";
  const author = process.env.ISSUE_AUTHOR ?? "";
  const commentFile = process.env.COMMENT_FILE;
  const githubOutput = process.env.GITHUB_OUTPUT;

  const agents = agentsFileSchema.parse(
    JSON.parse(
      await readFile(path.join(root, "dataset", "agents.json"), "utf8"),
    ),
  );

  const result = ingestIssue({
    body,
    author,
    agents,
    now: new Date(),
    random: randomBytes(4).toString("hex"),
  });

  if (commentFile) await writeFile(commentFile, `${result.comment}\n`);

  let file = "";
  if (result.ok) {
    file = await writeIngestResult(root, result);
  }

  if (githubOutput) {
    const lines = [`status=${result.ok ? "valid" : "invalid"}`];
    if (file) lines.push(`file=${file}`);
    await appendFile(githubOutput, `${lines.join("\n")}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
