import { lineOf } from "./files";
import { maskNonCode } from "./lexer";

export interface Mutation {
  index: number;
  line: number;
  from: string;
  to: string;
}

const operators: ReadonlyArray<[RegExp, string, string]> = [
  [/(?<![=!<>])===(?!=)/g, "===", "!=="],
  [/!==(?!=)/g, "!==", "==="],
  [/(?<![=!<>])<=(?![=>])/g, "<=", "<"],
  [/(?<![=!<>-])>=(?![=>])/g, ">=", ">"],
  [/&&(?!=)/g, "&&", "||"],
  [/\|\|(?!=)/g, "||", "&&"],
  [/(?<![\w$.])true(?![\w$])/g, "true", "false"],
  [/(?<![\w$.])false(?![\w$])/g, "false", "true"],
  [/(?<=[\w$)\]])\s\+\s(?=[\w$([{])/g, " + ", " - "],
  [/(?<=[\w$)\]])\s-\s(?=[\w$([{])/g, " - ", " + "],
];

/** Finds simple operator mutations in code (not comments or strings), in source order. */
export function findMutations(source: string): Mutation[] {
  const masked = maskNonCode(source);
  const mutations: Mutation[] = [];
  for (const [pattern, from, to] of operators) {
    for (const match of masked.matchAll(pattern)) {
      const index = match.index + match[0].indexOf(from.trim());
      const token = from.trim();
      if (source.slice(index, index + token.length) !== token) continue;
      mutations.push({
        index,
        line: lineOf(source, index),
        from: token,
        to: to.trim(),
      });
    }
  }
  return mutations.sort((a, b) => a.index - b.index);
}

export function isTypePosition(source: string, index: number): boolean {
  const prefix = maskNonCode(source).slice(0, index);
  const previous =
    /(\b(?:extends|satisfies|keyof|is|as)\b|(?<![|&])[|&]|:)\s*$/.exec(prefix);
  if (!previous) return false;
  const token = previous[1]!;
  if (token !== ":") return true;
  const beforeColon = prefix.slice(0, previous.index).trimEnd();
  return (
    /\b(?:let|const|var)\s+[A-Za-z_$][\w$]*$/.test(beforeColon) ||
    /[A-Za-z_$][\w$]*\?$/.test(beforeColon)
  );
}

export function applyMutation(source: string, mutation: Mutation): string {
  return (
    source.slice(0, mutation.index) +
    mutation.to +
    source.slice(mutation.index + mutation.from.length)
  );
}
