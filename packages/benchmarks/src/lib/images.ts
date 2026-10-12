import { lineOf } from "./files";

export const imageFileGlob =
  "**/*.{html,htm,jsx,tsx,js,mjs,vue,svelte,astro,mdx}";

export interface ImageScan {
  total: number;
  missing: number[];
}

const altNames = new Set(["alt", ":alt", "v-bind:alt", "[alt]", "[attr.alt]"]);

function skipQuoted(source: string, index: number): number {
  const quote = source[index];
  let cursor = index + 1;
  while (cursor < source.length && source[cursor] !== quote) {
    if (source[cursor] === "\\") cursor += 1;
    cursor += 1;
  }
  return cursor + 1;
}

function skipBraces(source: string, index: number): number {
  let depth = 0;
  let cursor = index;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '"' || char === "'" || char === "`") {
      cursor = skipQuoted(source, cursor);
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
    cursor += 1;
  }
  return cursor;
}

/** Reads a tag's attributes; returns their names and whether a spread is present. */
function readAttributes(
  source: string,
  start: number,
): { names: string[]; spread: boolean } {
  const names: string[] = [];
  let spread = false;
  let cursor = start;
  while (cursor < source.length) {
    const char = source[cursor] as string;
    if (/\s/.test(char) || char === "/") {
      cursor += 1;
      continue;
    }
    if (char === ">") break;
    if (char === "{") {
      if (/^\{\s*\.\.\./.test(source.slice(cursor, cursor + 10))) spread = true;
      cursor = skipBraces(source, cursor);
      continue;
    }
    const name = /^[^\s=>/{]+/.exec(source.slice(cursor))?.[0] ?? char;
    names.push(name.toLowerCase());
    cursor += name.length;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] !== "=") continue;
    cursor += 1;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    const value = source[cursor];
    if (value === '"' || value === "'") cursor = skipQuoted(source, cursor);
    else if (value === "{") cursor = skipBraces(source, cursor);
    else cursor += /^[^\s>]*/.exec(source.slice(cursor))?.[0].length ?? 0;
  }
  return { names, spread };
}

/** Finds `<img>` and `<Image>` tags without an `alt` attribute (static heuristic). */
export function scanImages(source: string): ImageScan {
  const cleaned = source
    .replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, (match) =>
      match.replace(/[^\n]/g, " "),
    );
  const missing: number[] = [];
  let total = 0;
  for (const match of cleaned.matchAll(/<(img|Image)(?=[\s/>])/gi)) {
    if (match[1] !== "Image" && match[1]?.toLowerCase() !== "img") continue;
    total += 1;
    const { names, spread } = readAttributes(
      cleaned,
      match.index + match[0].length,
    );
    if (!spread && !names.some((name) => altNames.has(name))) {
      missing.push(lineOf(source, match.index));
    }
  }
  return { total, missing };
}
