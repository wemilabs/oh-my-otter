const regexKeywords = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "yield",
  "await",
]);
const regexPrecedingChars = new Set("(,=:[!&|?{};+-*%<>~^");

function blank(chars: string[], from: number, to: number): void {
  for (let index = from; index < to; index += 1) {
    if (chars[index] !== "\n" && chars[index] !== "\r") chars[index] = " ";
  }
}

/**
 * Replaces comments and the contents of string, template, and regex literals
 * with spaces, keeping offsets and line breaks, so code tokens can be searched.
 * This is a lexical heuristic, not a full parser.
 */
export function maskNonCode(source: string): string {
  const chars = source.split("");
  const length = source.length;
  let previous = "";
  let index = 0;
  while (index < length) {
    const char = source[index] as string;
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      const newline = source.indexOf("\n", index);
      const end = newline === -1 ? length : newline;
      blank(chars, index, end);
      index = end;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = source.indexOf("*/", index + 2);
      const end = close === -1 ? length : close + 2;
      blank(chars, index, end);
      index = end;
      continue;
    }
    if (char === '"' || char === "'") {
      let cursor = index + 1;
      while (
        cursor < length &&
        source[cursor] !== char &&
        source[cursor] !== "\n"
      ) {
        cursor += source[cursor] === "\\" ? 2 : 1;
      }
      blank(chars, index + 1, Math.min(cursor, length));
      index = cursor + 1;
      previous = "literal";
      continue;
    }
    if (char === "`") {
      let cursor = index + 1;
      while (cursor < length && source[cursor] !== "`") {
        cursor += source[cursor] === "\\" ? 2 : 1;
      }
      blank(chars, index + 1, Math.min(cursor, length));
      index = cursor + 1;
      previous = "literal";
      continue;
    }
    if (
      char === "/" &&
      (previous === "" ||
        regexPrecedingChars.has(previous) ||
        regexKeywords.has(previous))
    ) {
      let cursor = index + 1;
      let inClass = false;
      while (cursor < length && source[cursor] !== "\n") {
        const current = source[cursor];
        if (current === "\\") {
          cursor += 2;
          continue;
        }
        if (current === "[") inClass = true;
        else if (current === "]") inClass = false;
        else if (current === "/" && !inClass) break;
        cursor += 1;
      }
      if (source[cursor] === "/") {
        blank(chars, index + 1, cursor);
        index = cursor + 1;
        previous = "literal";
        continue;
      }
    }
    if (/[A-Za-z0-9_$]/.test(char)) {
      let cursor = index;
      while (cursor < length && /[A-Za-z0-9_$]/.test(source[cursor] as string))
        cursor += 1;
      previous = source.slice(index, cursor);
      index = cursor;
      continue;
    }
    if (!/\s/.test(char)) previous = char;
    index += 1;
  }
  return chars.join("");
}

const typeWords = new Set([
  "as",
  "extends",
  "keyof",
  "readonly",
  "is",
  "satisfies",
  "typeof",
  "infer",
]);
const typeChars = new Set(":<,|&([=");

function previousToken(masked: string, index: number): string {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(masked[cursor] as string)) cursor -= 1;
  if (cursor < 0) return "";
  if (!/[A-Za-z0-9_$]/.test(masked[cursor] as string))
    return masked[cursor] as string;
  const end = cursor + 1;
  while (cursor >= 0 && /[A-Za-z0-9_$]/.test(masked[cursor] as string))
    cursor -= 1;
  return masked.slice(cursor + 1, end);
}

function isArrow(masked: string, index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(masked[cursor] as string)) cursor -= 1;
  return masked[cursor] === ">" && masked[cursor - 1] === "=";
}

function nextChar(masked: string, index: number): string {
  let cursor = index;
  while (cursor < masked.length && /\s/.test(masked[cursor] as string))
    cursor += 1;
  return masked[cursor] ?? "";
}

/** Counts `any` used as a type in TypeScript source (lexical heuristic). */
export function countExplicitAny(source: string): number {
  const masked = maskNonCode(source);
  let count = 0;
  for (const match of masked.matchAll(/(?<![\w$.])any(?![\w$])/g)) {
    const start = match.index;
    const before = previousToken(masked, start);
    const after = nextChar(masked, start + 3);
    if (after === ":" || after === "?") continue;
    if (
      typeChars.has(before) ||
      typeWords.has(before) ||
      isArrow(masked, start)
    )
      count += 1;
  }
  return count;
}

const suppressionPattern =
  /@ts-(?:ignore|expect-error|nocheck)\b|eslint-disable(?:-next-line|-line)?\b[^\n]*no-explicit-any/g;

export function countTypeSuppressions(source: string): number {
  return [...source.matchAll(suppressionPattern)].length;
}
