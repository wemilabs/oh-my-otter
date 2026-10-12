import { copyFile } from "node:fs/promises";
import path from "node:path";

const packageDirectory = process.cwd();
const repositoryDirectory = path.resolve(packageDirectory, "../..");
const files = process.argv.slice(2);

if (
  files.length === 0 ||
  files.some((file) => !["LICENSE", "README.md"].includes(file))
) {
  throw new Error("Expected LICENSE and/or README.md.");
}

await Promise.all(
  files.map((file) =>
    copyFile(
      path.join(repositoryDirectory, file),
      path.join(packageDirectory, file),
    ),
  ),
);
