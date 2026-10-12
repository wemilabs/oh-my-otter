import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes one validated report to dataset/reports (create-only).
 * Returns the repository-relative file path.
 */
export async function writeIngestResult(
  root: string,
  result: { fileName: string; contents: string },
): Promise<string> {
  const relative = path.posix.join("dataset", "reports", result.fileName);
  await mkdir(path.join(root, "dataset", "reports"), { recursive: true });
  await writeFile(path.join(root, relative), result.contents, {
    flag: "wx",
  });
  return relative;
}
