import path from "node:path";
import { maskNonCode } from "./lexer";

const specifierPatterns = [
  /\bfrom\s*(["'])/g,
  /\bimport\s*(["'])/g,
  /\bimport\s*\(\s*(["'])/g,
  /\brequire\s*\(\s*(["'])/g,
];

/** Module specifiers of `import`/`export ... from`/`import()`/`require()` in code. */
export function moduleSpecifiers(source: string): string[] {
  const masked = maskNonCode(source);
  const found: { index: number; value: string }[] = [];
  for (const pattern of specifierPatterns) {
    for (const match of masked.matchAll(pattern)) {
      const quote = match[1] as string;
      const open = match.index + match[0].length - 1;
      const close = source.indexOf(quote, open + 1);
      if (close === -1) continue;
      const value = source.slice(open + 1, close);
      if (value.includes("\n")) continue;
      found.push({ index: open, value });
    }
  }
  return found
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.value);
}

const moduleExtension = /\.(?:[cm]?[jt]sx?)$/;

function moduleKey(file: string): string {
  const withoutExtension = path.posix
    .normalize(file.replace(/\\/g, "/"))
    .replace(moduleExtension, "");
  return withoutExtension === "index"
    ? "."
    : withoutExtension.replace(/\/index$/, "");
}

/**
 * True when `specifier`, written in `fromFile`, resolves to `target` (both
 * repository-relative). Relative specifiers resolve against the importing
 * file; `@/` and `~/` aliases resolve against the repository root or `src/`.
 * Extensions are optional and `.js` may stand for `.ts`; `dir` matches
 * `dir/index.*`.
 */
export function resolvesTo(
  specifier: string,
  fromFile: string,
  target: string,
): boolean {
  const wanted = moduleKey(target);
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const resolved = path.posix.join(
      path.posix.dirname(fromFile.replace(/\\/g, "/")),
      specifier,
    );
    return moduleKey(resolved) === wanted;
  }
  const alias = /^[@~]\/(.+)$/.exec(specifier);
  if (alias) {
    const rest = alias[1] as string;
    return moduleKey(rest) === wanted || moduleKey(`src/${rest}`) === wanted;
  }
  return false;
}

export function importsModule(
  source: string,
  fromFile: string,
  target: string,
): boolean {
  return moduleSpecifiers(source).some((specifier) =>
    resolvesTo(specifier, fromFile, target),
  );
}

function blankRange(text: string, from: number, to: number): string {
  return text.slice(0, from) + " ".repeat(to - from) + text.slice(to);
}

const declarationPatterns = [
  /\b(?:import|export)\s+(?:type\s+)?[^;]*?\bfrom\s*["']/g,
  /\b(?:const|let|var)\s+(?:\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:require|import)\s*\(/g,
];

/**
 * True when `name` is used in code: comments and string literals are ignored,
 * and so are import/require declarations, so importing a function without
 * using it does not count. Member access (`mod.name`) counts.
 */
export function referencesIdentifier(source: string, name: string): boolean {
  let masked = maskNonCode(source);
  for (const pattern of declarationPatterns) {
    for (const match of masked.matchAll(pattern)) {
      masked = blankRange(masked, match.index, match.index + match[0].length);
    }
  }
  const escaped = name.replace(/[$]/g, "\\$");
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(masked);
}

const testCasePattern =
  /(?<![\w$.])(?:it|test)\s*(?:\.\s*(?:only|concurrent|sequential|each)\s*)?\(/g;

/** Counts `it(`/`test(` calls in code (comments and strings ignored). */
export function countTestCases(source: string): number {
  return [...maskNonCode(source).matchAll(testCasePattern)].length;
}
