import type { AgentGroup, Group } from "@oh-my-otter/benchmarks/report";

export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function NotEnough() {
  return <span className="text-muted-foreground">Not enough data yet</span>;
}

export function StatsTable({
  title,
  groups,
  showN = true,
}: {
  title: string;
  groups: Group[];
  showN?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4 text-sm font-medium">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wider text-muted-foreground uppercase">
              <th className="px-5 py-3 font-medium">Group</th>
              {showN ? <th className="px-5 py-3 font-medium">n</th> : null}
              <th className="px-5 py-3 font-medium">Pass</th>
              <th className="px-5 py-3 font-medium">Partial</th>
              <th className="px-5 py-3 font-medium">Fail</th>
              <th className="px-5 py-3 font-medium">Median corrections</th>
              <th className="px-5 py-3 font-medium">Median minutes</th>
              <th className="px-5 py-3 font-medium">Median attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((group) => (
              <tr key={group.key}>
                <td className="px-5 py-3 font-mono text-[13px]">
                  {group.label}
                </td>
                {showN ? (
                  <td className="px-5 py-3 font-mono text-[13px] text-muted-foreground">
                    {group.stats.n}
                  </td>
                ) : null}
                {(
                  [
                    group.stats.pass_rate,
                    group.stats.partial_rate,
                    group.stats.fail_rate,
                  ] as const
                ).map((rate, i) => (
                  <td key={i} className="px-5 py-3 font-mono text-[13px]">
                    {group.stats.enough ? formatRate(rate) : <NotEnough />}
                  </td>
                ))}
                {(
                  [
                    group.stats.median_corrections,
                    group.stats.median_minutes,
                    group.stats.median_attempts,
                  ] as const
                ).map((value, i) => (
                  <td key={i} className="px-5 py-3 font-mono text-[13px]">
                    {group.stats.enough ? formatNumber(value) : <NotEnough />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DimensionList({ label, groups }: { label: string; groups: Group[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <table className="mt-1 w-full text-sm">
        <tbody className="divide-y divide-border">
          {groups.map((group) => (
            <tr key={group.key}>
              <td className="py-1.5 pr-4 font-mono text-[13px]">
                {group.label}
              </td>
              <td className="w-14 py-1.5 font-mono text-[13px] text-muted-foreground">
                n={group.stats.n}
              </td>
              <td className="w-24 py-1.5 text-right font-mono text-[13px]">
                {group.stats.enough ? (
                  formatRate(group.stats.pass_rate)
                ) : (
                  <NotEnough />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgentTable({ groups }: { groups: AgentGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        No reports yet — n = 0 everywhere.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {groups.map((group) => (
        <details key={group.key} className="group px-5 py-4" open={false}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 text-sm [&::-webkit-details-marker]:hidden">
            <span className="font-medium">
              {group.label}
              {!group.ranked ? (
                <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  unranked
                </span>
              ) : null}
            </span>
            <span className="font-mono text-[13px] text-muted-foreground">
              n={group.stats.n}
            </span>
            <span className="ml-auto font-mono text-[13px]">
              {group.stats.enough ? (
                <>
                  {formatRate(group.stats.pass_rate)} pass ·{" "}
                  {formatNumber(group.stats.median_corrections)} corrections ·{" "}
                  {formatNumber(group.stats.median_minutes)} min ·{" "}
                  {formatNumber(group.stats.median_attempts)} attempts
                </>
              ) : (
                <NotEnough />
              )}
            </span>
          </summary>
          <div className="mt-2 grid gap-x-10 sm:grid-cols-2">
            <DimensionList label="By agent version" groups={group.versions} />
            <DimensionList label="By model" groups={group.models} />
          </div>
        </details>
      ))}
    </div>
  );
}
