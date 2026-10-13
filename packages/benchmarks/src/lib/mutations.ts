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

const typeOperands =
  /(?:\b(?:string|number|boolean|bigint|symbol|object|null|undefined|never|unknown|any|void|true|false)\b|\b[A-Z][\w$]*)$/;
const numberLiteral =
  /(?:\b(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?n?)|\.\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?)$/;

function isStringLiteralOperand(
  source: string,
  maskedPrefix: string,
  end: number,
): boolean {
  const beforeOperator = maskedPrefix.slice(0, end).trimEnd();
  const quote = beforeOperator.at(-1);
  if (quote !== "'" && quote !== '"' && quote !== "`") return false;
  let cursor = beforeOperator.length - 2;
  if (source[beforeOperator.length - 1] !== quote) return false;
  while (cursor >= 0) {
    if (source[cursor] === quote) {
      let escapes = 0;
      for (
        let index = cursor - 1;
        index >= 0 && source[index] === "\\";
        index--
      )
        escapes += 1;
      if (escapes % 2 === 0) return true;
    }
    cursor -= 1;
  }
  return false;
}

export function isTypePosition(source: string, index: number): boolean {
  const prefix = maskNonCode(source).slice(0, index);
  const previous =
    /(\b(?:extends|satisfies|keyof|is|as)\b|(?<![|&])[|&]|<|=|:)\s*$/.exec(
      prefix,
    );
  if (!previous) return false;
  const token = previous[1]!;
  if (token === "=") {
    const beforeEquals = prefix.slice(0, previous.index).trimEnd();
    return /\btype\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*$/.test(beforeEquals);
  }
  if (token === "<") return /[\w$]<\s*$/.test(prefix);
  if (token === "|" || token === "&") {
    const beforeOperator = prefix.slice(0, previous.index).trimEnd();
    return (
      typeOperands.test(beforeOperator) ||
      /[)\]}>]$/.test(beforeOperator) ||
      numberLiteral.test(beforeOperator) ||
      isStringLiteralOperand(source, prefix, previous.index)
    );
  }
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
