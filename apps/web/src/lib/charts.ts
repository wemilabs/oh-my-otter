import type { AgentGroup, Group } from "@oh-my-otter/benchmarks/report";

export interface RateRow {
  key: string;
  label: string;
  n: number;
  enough: boolean;
  ranked: boolean;
  pass: number | null;
  partial: number | null;
  fail: number | null;
}

export function toRateRows(groups: Array<Group | AgentGroup>): RateRow[] {
  return groups.map((group) => {
    const { stats } = group;
    const ranked = "ranked" in group ? (group.ranked ?? true) : true;
    return {
      key: group.key,
      label: group.label,
      n: stats.n,
      enough: stats.enough,
      ranked,
      pass: stats.enough
        ? stats.pass_rate === null
          ? null
          : stats.pass_rate * 100
        : null,
      partial: stats.enough
        ? stats.partial_rate === null
          ? null
          : stats.partial_rate * 100
        : null,
      fail: stats.enough
        ? stats.fail_rate === null
          ? null
          : stats.fail_rate * 100
        : null,
    };
  });
}
