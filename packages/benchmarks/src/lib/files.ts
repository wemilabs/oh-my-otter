const testSegments = new Set(["__tests__", "__snapshots__", "test", "tests"]);
const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const snapshotPattern = /\.snap$/;

export const lockfileNames = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

export function isTestFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const name = segments.at(-1) ?? "";
  return (
    testFilePattern.test(name) ||
    snapshotPattern.test(name) ||
    segments.slice(0, -1).some((segment) => testSegments.has(segment))
  );
}

export function isLockfile(file: string): boolean {
  const name = file.replace(/\\/g, "/").split("/").at(-1) ?? "";
  return lockfileNames.includes(name);
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function lineOf(source: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (source.charCodeAt(position) === 10) line += 1;
  }
  return line;
}

export function summarizeList(values: readonly string[], limit = 5): string {
  const shown = values.slice(0, limit).join(", ");
  return values.length > limit
    ? `${shown}, and ${values.length - limit} more`
    : shown;
}
