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

const namedImportPattern = /\bimport\s*\{([^}]*)\}/g;
const staticImportPattern = /\bimport\s+([^;]*?)\s+from\s*(["'])/g;
const destructuredImportPattern =
  /\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s+)?(?:require|import)\s*\(/g;
const assignedImportPattern =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:require|import)\s*\(/g;
const identifierPattern = /^[A-Za-z_$][\w$]*$/;

function specifierAt(
  source: string,
  open: number,
  quote: string,
): string | undefined {
  const close = source.indexOf(quote, open + 1);
  if (close === -1) return undefined;
  const specifier = source.slice(open + 1, close);
  return specifier.includes("\n") ? undefined : specifier;
}

function quotedSpecifierAt(
  source: string,
  masked: string,
  start: number,
  pattern: RegExp,
): string | undefined {
  const match = pattern.exec(masked.slice(start));
  if (!match) return undefined;
  const quote = match[1] as string;
  const open = start + match.index + match[0].length - 1;
  return specifierAt(source, open, quote);
}

function isInScope(
  specifier: string | undefined,
  scope: { fromFile: string; target: string } | undefined,
): boolean {
  return (
    scope === undefined ||
    (specifier !== undefined &&
      resolvesTo(specifier, scope.fromFile, scope.target))
  );
}

function namedBindings(bindings: string): string[] {
  const names: string[] = [];
  for (const binding of bindings.split(",")) {
    if (/^\s*type\b/.test(binding)) continue;
    const match =
      /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(binding);
    if (match) names.push((match[2] ?? match[1]) as string);
  }
  return names;
}

function staticImportBindings(clause: string): string[] {
  if (/^\s*type\b/.test(clause)) return [];
  const names: string[] = [];
  const defaultBinding = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause)?.[1];
  if (defaultBinding) names.push(defaultBinding);
  const namespaceBinding = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause)?.[1];
  if (namespaceBinding) names.push(namespaceBinding);
  const named = /\{([^}]*)\}/.exec(clause)?.[1];
  if (named !== undefined) names.push(...namedBindings(named));
  return names;
}

function destructuredBindings(bindings: string): string[] {
  const names: string[] = [];
  for (const binding of bindings.split(",")) {
    const withoutDefault = binding.split("=")[0] ?? "";
    const match =
      /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/.exec(
        withoutDefault,
      );
    if (match) names.push((match[2] ?? match[1]) as string);
  }
  return names;
}

function scopedBindings(
  source: string,
  masked: string,
  scope: { fromFile: string; target: string },
): {
  otherModuleBindings: Set<string>;
  targetNamespaces: Set<string>;
} {
  const otherModuleBindings = new Set<string>();
  const targetNamespaces = new Set<string>();
  for (const match of masked.matchAll(staticImportPattern)) {
    const clause = match[1] ?? "";
    const quote = match[2] as string;
    const specifier = specifierAt(
      source,
      match.index + match[0].length - 1,
      quote,
    );
    const isTarget =
      specifier !== undefined &&
      resolvesTo(specifier, scope.fromFile, scope.target);
    if (isTarget) {
      const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause)?.[1];
      if (namespace) targetNamespaces.add(namespace);
    } else {
      for (const binding of staticImportBindings(clause)) {
        otherModuleBindings.add(binding);
      }
    }
  }
  for (const match of masked.matchAll(destructuredImportPattern)) {
    const specifier = quotedSpecifierAt(
      source,
      masked,
      match.index + match[0].length,
      /^\s*(["'])/,
    );
    if (
      specifier === undefined ||
      !resolvesTo(specifier, scope.fromFile, scope.target)
    ) {
      for (const binding of destructuredBindings(match[1] ?? "")) {
        otherModuleBindings.add(binding);
      }
    }
  }
  for (const match of masked.matchAll(assignedImportPattern)) {
    const specifier = quotedSpecifierAt(
      source,
      masked,
      match.index + match[0].length,
      /^\s*(["'])/,
    );
    const binding = match[1] as string;
    if (
      specifier !== undefined &&
      resolvesTo(specifier, scope.fromFile, scope.target)
    ) {
      targetNamespaces.add(binding);
    } else {
      otherModuleBindings.add(binding);
    }
  }
  return { otherModuleBindings, targetNamespaces };
}

/** Local bindings for imports of `name`, including common aliases. */
export function localNames(
  source: string,
  name: string,
  scope?: { fromFile: string; target: string },
): string[] {
  const masked = maskNonCode(source);
  const aliases: string[] = [];
  for (const match of masked.matchAll(namedImportPattern)) {
    const specifier = quotedSpecifierAt(
      source,
      masked,
      match.index + match[0].length,
      /^\s*from\s*(["'])/,
    );
    if (!isInScope(specifier, scope)) continue;
    for (const binding of (match[1] ?? "").split(",")) {
      if (/^\s*type\b/.test(binding)) continue;
      const alias = /^\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(
        binding,
      );
      if (alias?.[1] === name) aliases.push(alias[2] as string);
    }
  }
  const escaped = name.replace(/[$]/g, "\\$");
  const destructuredAlias = new RegExp(
    `^\\s*${escaped}\\s*:\\s*([A-Za-z_$][\\w$]*)\\s*$`,
  );
  for (const match of masked.matchAll(destructuredImportPattern)) {
    const specifier = quotedSpecifierAt(
      source,
      masked,
      match.index + match[0].length,
      /^\s*(["'])/,
    );
    if (!isInScope(specifier, scope)) continue;
    for (const binding of (match[1] ?? "").split(",")) {
      const alias = destructuredAlias.exec(binding);
      if (alias && identifierPattern.test(alias[1] as string)) {
        aliases.push(alias[1] as string);
      }
    }
  }
  const names = new Set([name, ...aliases]);
  if (scope) {
    const { otherModuleBindings } = scopedBindings(source, masked, scope);
    if (otherModuleBindings.has(name)) names.delete(name);
  }
  return [...names];
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
export function referencesIdentifier(
  source: string,
  name: string,
  scope?: { fromFile: string; target: string },
): boolean {
  const names = localNames(source, name, scope);
  let masked = maskNonCode(source);
  const targetNamespaces = scope
    ? scopedBindings(source, masked, scope).targetNamespaces
    : new Set<string>();
  for (const pattern of declarationPatterns) {
    for (const match of masked.matchAll(pattern)) {
      masked = blankRange(masked, match.index, match.index + match[0].length);
    }
  }
  const escapedName = name.replace(/[$]/g, "\\$");
  if (
    [...targetNamespaces].some((namespace) => {
      const escapedNamespace = namespace.replace(/[$]/g, "\\$");
      return new RegExp(
        `(?<![\\w$.])${escapedNamespace}\\s*\\.\\s*${escapedName}(?![\\w$])`,
      ).test(masked);
    })
  ) {
    return true;
  }
  return names.some((localName) => {
    const escaped = localName.replace(/[$]/g, "\\$");
    return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`).test(masked);
  });
}

const testCasePattern =
  /(?<![\w$.])(?:it|test)\s*(?:\.\s*(?:only|concurrent|sequential|each)\s*)?\(/g;

/** Counts `it(`/`test(` calls in code (comments and strings ignored). */
export function countTestCases(source: string): number {
  return [...maskNonCode(source).matchAll(testCasePattern)].length;
}
