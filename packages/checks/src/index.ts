import type { Check, CheckCategory } from "@oh-my-otter/core";
import * as registry from "./registry";

const categoryOrder: Record<CheckCategory, number> = {
  setup: 0,
  verification: 1,
  docs: 2,
  hygiene: 3,
};

function sortChecks(checks: readonly Check[]): Check[] {
  return [...checks].sort(
    (left, right) =>
      categoryOrder[left.category] - categoryOrder[right.category] ||
      right.weight - left.weight ||
      left.id.localeCompare(right.id),
  );
}

export const builtinChecks: readonly Check[] = sortChecks(
  Object.values(registry),
);
