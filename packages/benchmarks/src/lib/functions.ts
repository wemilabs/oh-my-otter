import { maskNonCode } from "./lexer";

export interface FunctionBody {
  start: number;
  end: number;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function skipSpace(source: string, index: number): number {
  while (index < source.length && /\s/.test(source[index] as string))
    index += 1;
  return index;
}

function matchingClose(
  source: string,
  openIndex: number,
  open: string,
  close: string,
): number | null {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function matchingGenericClose(source: string, start: number): number | null {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "<") depth += 1;
    else if (source.startsWith("=>", index)) index += 1;
    else if (source[index] === ">" && --depth === 0) return index + 1;
  }
  return null;
}

function typeLiteralStart(source: string, index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor] as string)) cursor -= 1;
  if (cursor < 0) return false;
  const previous = source[cursor] as string;
  return (
    [":", "|", "&", "<", ","].includes(previous) ||
    (previous === ">" && source[cursor - 1] === "=")
  );
}

function scanReturnType(
  source: string,
  start: number,
  stopAtArrow: boolean,
): number | null {
  let parentheses = 0;
  let brackets = 0;
  let angles = 0;
  let braces = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index] as string;
    if (
      stopAtArrow &&
      parentheses === 0 &&
      brackets === 0 &&
      angles === 0 &&
      braces === 0 &&
      source.startsWith("=>", index)
    ) {
      return index;
    }
    if (char === "{" && parentheses === 0 && brackets === 0 && angles === 0) {
      if (braces === 0 && !typeLiteralStart(source, index)) return index;
      braces += 1;
    } else if (char === "}" && braces > 0) braces -= 1;
    else if (char === "(") parentheses += 1;
    else if (char === ")" && parentheses > 0) parentheses -= 1;
    else if (char === "[") brackets += 1;
    else if (char === "]" && brackets > 0) brackets -= 1;
    else if (char === "<") angles += 1;
    else if (char === ">" && angles > 0) angles -= 1;
    else if (
      char === ";" &&
      parentheses === 0 &&
      brackets === 0 &&
      angles === 0 &&
      braces === 0
    ) {
      return null;
    }
  }
  return null;
}

function blockBody(source: string, index: number): FunctionBody | null {
  if (source[index] !== "{") return null;
  const close = matchingClose(source, index, "{", "}");
  return close === null ? null : { start: index, end: close + 1 };
}

function expressionEnd(source: string, start: number): number {
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index] as string;
    if (char === ";" && parentheses === 0 && brackets === 0 && braces === 0) {
      return index;
    }
    if (char === "\n" && parentheses === 0 && brackets === 0 && braces === 0) {
      const lineStart = source.lastIndexOf("\n", index - 1) + 1;
      const previousLine = source.slice(lineStart, index).trimEnd();
      const nextLine =
        source.slice(index + 1).match(/^\s*([^\r\n]+)/)?.[1] ?? "";
      if (
        !/(?:[=.,?&|+*/%-]|=>|\(|:)$/.test(previousLine.trim()) &&
        !/^\s*(?:[.?]|&&|\|\||[+\-*/:])/.test(nextLine)
      ) {
        return index;
      }
    }
    if (char === "(") parentheses += 1;
    else if (char === ")") {
      if (parentheses === 0 && brackets === 0 && braces === 0) return index;
      parentheses -= 1;
    } else if (char === "[") brackets += 1;
    else if (char === "]") {
      if (parentheses === 0 && brackets === 0 && braces === 0) return index;
      brackets -= 1;
    } else if (char === "{") braces += 1;
    else if (char === "}") {
      if (parentheses === 0 && brackets === 0 && braces === 0) return index;
      braces -= 1;
    }
  }
  return source.length;
}

function arrowBody(source: string, arrow: number): FunctionBody | null {
  const start = skipSpace(source, arrow + 2);
  if (source[start] === "{") return blockBody(source, start);
  const end = expressionEnd(source, start);
  return end > start ? { start, end } : null;
}

function afterParameters(
  source: string,
  close: number,
  allowArrow: boolean,
): FunctionBody | null {
  let cursor = skipSpace(source, close + 1);
  if (source[cursor] === ":") {
    const next = scanReturnType(source, cursor + 1, allowArrow);
    if (next === null) return null;
    cursor = next;
  }
  cursor = skipSpace(source, cursor);
  if (allowArrow && source.startsWith("=>", cursor)) {
    return arrowBody(source, cursor);
  }
  return blockBody(source, cursor);
}

function functionDeclarationBody(
  source: string,
  name: string,
): FunctionBody | null {
  const pattern = new RegExp(
    `(?<![\\w$.])(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?function\\s*\\*?\\s*${escaped(name)}\\s*`,
    "g",
  );
  for (const match of source.matchAll(pattern)) {
    let cursor = skipSpace(source, match.index + match[0].length);
    if (source[cursor] === "<") {
      const end = matchingGenericClose(source, cursor);
      if (end === null) continue;
      cursor = skipSpace(source, end);
    }
    if (source[cursor] !== "(") continue;
    const open = cursor;
    const close = matchingClose(source, open, "(", ")");
    if (close === null) continue;
    const body = afterParameters(source, close, false);
    if (body) return body;
  }
  return null;
}

function findAssignment(source: string, start: number): number | null {
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  let angles = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index] as string;
    if (
      char === "=" &&
      source[index + 1] !== ">" &&
      source[index + 1] !== "=" &&
      !["=", "!", "<", ">"].includes(source[index - 1] ?? "") &&
      parentheses === 0 &&
      brackets === 0 &&
      braces === 0 &&
      angles === 0
    ) {
      return index;
    }
    if (char === "(") parentheses += 1;
    else if (char === ")" && parentheses > 0) parentheses -= 1;
    else if (char === "[") brackets += 1;
    else if (char === "]" && brackets > 0) brackets -= 1;
    else if (char === "{") braces += 1;
    else if (char === "}" && braces > 0) braces -= 1;
    else if (char === "<") angles += 1;
    else if (char === ">" && angles > 0) angles -= 1;
  }
  return null;
}

function functionExpressionBody(
  source: string,
  start: number,
): FunctionBody | null {
  let cursor = skipSpace(source, start);
  if (/\basync\b/.test(source.slice(cursor, cursor + 6))) {
    cursor = skipSpace(source, cursor + 5);
  }
  if (!source.startsWith("function", cursor)) return null;
  cursor = skipSpace(source, cursor + "function".length);
  if (source[cursor] === "*") cursor = skipSpace(source, cursor + 1);
  if (/[A-Za-z_$]/.test(source[cursor] ?? "")) {
    while (/[A-Za-z0-9_$]/.test(source[cursor] ?? "")) cursor += 1;
    cursor = skipSpace(source, cursor);
  }
  if (source[cursor] === "<") {
    const end = source.indexOf(">", cursor + 1);
    if (end < 0) return null;
    cursor = skipSpace(source, end + 1);
  }
  if (source[cursor] !== "(") return null;
  const close = matchingClose(source, cursor, "(", ")");
  return close === null ? null : afterParameters(source, close, false);
}

function arrowFunctionBody(source: string, start: number): FunctionBody | null {
  let cursor = skipSpace(source, start);
  if (/\basync\b/.test(source.slice(cursor, cursor + 6))) {
    cursor = skipSpace(source, cursor + 5);
  }
  if (source[cursor] === "(") {
    const close = matchingClose(source, cursor, "(", ")");
    if (close === null) return null;
    cursor = skipSpace(source, close + 1);
  } else {
    const identifier = /^[A-Za-z_$][\w$]*/.exec(source.slice(cursor));
    if (!identifier) return null;
    cursor = skipSpace(source, cursor + identifier[0].length);
  }
  if (source[cursor] === ":") {
    const arrow = scanReturnType(source, cursor + 1, true);
    return arrow === null ? null : arrowBody(source, arrow);
  }
  return source.startsWith("=>", cursor) ? arrowBody(source, cursor) : null;
}

function variableFunctionBody(
  source: string,
  name: string,
): FunctionBody | null {
  const pattern = new RegExp(
    `(?<![\\w$.])(?:export\\s+)?(?:const|let|var)\\s+${escaped(name)}\\b`,
    "g",
  );
  for (const match of source.matchAll(pattern)) {
    let cursor = skipSpace(source, match.index + match[0].length);
    if (source[cursor] !== ":" && source[cursor] !== "=") continue;
    if (source[cursor] === ":") {
      const assignment = findAssignment(source, cursor + 1);
      if (assignment === null) continue;
      cursor = assignment;
    }
    const initializer = skipSpace(source, cursor + 1);
    const functionBody = functionExpressionBody(source, initializer);
    if (functionBody) return functionBody;
    const arrowBodyRange = arrowFunctionBody(source, initializer);
    if (arrowBodyRange) return arrowBodyRange;
  }
  return null;
}

function methodBody(source: string, name: string): FunctionBody | null {
  const pattern = new RegExp(
    `^[ \\t]*(?:(?:public|private|protected|static|async|override|readonly|get|set)\\s+)*\\*?${escaped(name)}\\s*`,
    "gm",
  );
  for (const match of source.matchAll(pattern)) {
    let cursor = skipSpace(source, match.index + match[0].length);
    if (source[cursor] === "<") {
      const end = matchingGenericClose(source, cursor);
      if (end === null) continue;
      cursor = skipSpace(source, end);
    }
    if (source[cursor] !== "(") continue;
    const open = cursor;
    const close = matchingClose(source, open, "(", ")");
    if (close === null) continue;
    const next = skipSpace(source, close + 1);
    if (source[next] !== "{" && source[next] !== ":") continue;
    const body = afterParameters(source, close, false);
    if (body) return body;
  }
  return null;
}

export function findFunctionBody(
  source: string,
  name: string,
): FunctionBody | null {
  const masked = maskNonCode(source);
  return (
    functionDeclarationBody(masked, name) ??
    variableFunctionBody(masked, name) ??
    methodBody(masked, name)
  );
}
