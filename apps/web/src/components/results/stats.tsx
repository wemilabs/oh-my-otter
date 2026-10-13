import Link from "next/link";
import {
  MIN_SAMPLE,
  type AgentGroup,
  type Group,
} from "@oh-my-otter/benchmarks/report";

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

export function NotEnoughBar({ n }: { n: number }) {
  const filled = Math.min(n, MIN_SAMPLE);
  return (
    <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: MIN_SAMPLE }, (_, i) => (
          <span
            key={i}
            className={
              i < filled
                ? "h-1.5 w-5 rounded-full bg-brand"
                : "h-1.5 w-5 rounded-full bg-foreground/10"
            }
          />
        ))}
      </div>
      <span>
        Not enough data yet · {filled}/{MIN_SAMPLE} reports
      </span>
    </div>
  );
}

export function DataUnavailable() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-medium tracking-tight">
        Data temporarily unavailable
      </h3>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Results are refreshed hourly. Please check back shortly.
      </p>
    </div>
  );
}

function StatsRows({
  group,
  linkPrefix,
}: {
  group: Group;
  linkPrefix?: string;
}) {
  const rows: Array<[string, React.ReactNode]> = group.stats.enough
    ? [
        ["Pass", formatRate(group.stats.pass_rate)],
        ["Partial", formatRate(group.stats.partial_rate)],
        ["Fail", formatRate(group.stats.fail_rate)],
        ["Median corrections", formatNumber(group.stats.median_corrections)],
        ["Median minutes", formatNumber(group.stats.median_minutes)],
        ["Median attempts", formatNumber(group.stats.median_attempts)],
      ]
    : [
        ["", <NotEnoughBar key="bar" n={group.stats.n} />] as [
          string,
          React.ReactNode,
        ],
      ];
  return (
    <>
      <div className="px-5 py-3 font-mono text-[13px] font-medium">
        {linkPrefix ? (
          <Link
            href={`${linkPrefix}${group.key}`}
            prefetch={true}
            className="inline-flex min-h-11 items-center hover:underline"
          >
            {group.label}
          </Link>
        ) : (
          group.label
        )}
        <span className="ml-2 text-muted-foreground">n={group.stats.n}</span>
      </div>
      <dl className="space-y-1.5 px-5 pb-4">
        {rows.map(([label, value], i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 text-sm"
          >
            {label ? (
              <>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono text-[13px]">{value}</dd>
              </>
            ) : (
              <dd className="w-full">{value}</dd>
            )}
          </div>
        ))}
      </dl>
    </>
  );
}

export function StatsTable({
  title,
  groups,
  showN = true,
  linkPrefix,
}: {
  title: string;
  groups: Group[];
  showN?: boolean;
  /** Prefix group keys into links, e.g. "/tasks/" for task rows. */
  linkPrefix?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4 text-sm font-medium">
        {title}
      </div>
      <div className="divide-y divide-border md:hidden">
        {groups.map((group) => (
          <div key={group.key} className="py-1">
            <StatsRows group={group} linkPrefix={linkPrefix} />
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wider text-muted-foreground uppercase">
              <th className="px-5 py-3 font-medium whitespace-nowrap">Group</th>
              {showN ? (
                <th className="px-5 py-3 font-medium whitespace-nowrap">n</th>
              ) : null}
              <th className="px-5 py-3 font-medium whitespace-nowrap">Pass</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">
                Partial
              </th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">Fail</th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">
                Median corrections
              </th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">
                Median minutes
              </th>
              <th className="px-5 py-3 font-medium whitespace-nowrap">
                Median attempts
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((group) => (
              <tr key={group.key}>
                <td className="px-5 py-3 font-mono text-[13px] whitespace-nowrap">
                  {linkPrefix ? (
                    <Link
                      href={`${linkPrefix}${group.key}`}
                      prefetch={true}
                      className="inline-flex min-h-11 items-center hover:underline"
                    >
                      {group.label}
                    </Link>
                  ) : (
                    group.label
                  )}
                </td>
                {showN ? (
                  <td className="px-5 py-3 font-mono text-[13px] text-muted-foreground">
                    {group.stats.n}
                  </td>
                ) : null}
                {group.stats.enough ? (
                  <>
                    {(
                      [
                        group.stats.pass_rate,
                        group.stats.partial_rate,
                        group.stats.fail_rate,
                      ] as const
                    ).map((rate, i) => (
                      <td
                        key={`r${i}`}
                        className="px-5 py-3 font-mono text-[13px]"
                      >
                        {formatRate(rate)}
                      </td>
                    ))}
                    {(
                      [
                        group.stats.median_corrections,
                        group.stats.median_minutes,
                        group.stats.median_attempts,
                      ] as const
                    ).map((value, i) => (
                      <td
                        key={`m${i}`}
                        className="px-5 py-3 font-mono text-[13px]"
                      >
                        {formatNumber(value)}
                      </td>
                    ))}
                  </>
                ) : (
                  <td colSpan={6} className="px-5 py-3">
                    <NotEnoughBar n={group.stats.n} />
                  </td>
                )}
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
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        No reports yet — n = 0 everywhere.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {groups.map((group) => (
        <details key={group.key} className="group px-5 py-4" open={false}>
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 text-sm [&::-webkit-details-marker]:hidden">
            <span className="font-medium">
              {group.label}
              {!group.ranked ? (
                <span className="ml-2 rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
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
