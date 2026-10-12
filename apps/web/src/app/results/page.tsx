import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/landing/sections";
import { AgentTable, StatsTable } from "@/components/results/stats";
import { getDataset } from "@/lib/dataset";

export const metadata: Metadata = {
  title: "Results",
  description:
    "Anonymous, self-reported omot bench results aggregated by task, readiness band, and coding agent.",
};

export default function ResultsPage() {
  const { aggregate } = getDataset();
  const empty = aggregate.total === 0;
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 pt-16 pb-12 sm:px-8 sm:pt-24">
          <SectionHeading eyebrow="Results" title="Anonymous benchmark results">
            Aggregated from reports submitted with omot report, always with the
            sample size n. Cells with fewer than five reports are hidden.
          </SectionHeading>
        </div>
      </section>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl space-y-10 px-5 py-14 sm:px-8">
          <div className="rounded-xl border border-border bg-wash p-5 text-sm leading-relaxed text-muted-foreground">
            Results are self-reported by people running omot; outcomes are
            verified locally by the CLI, but corrections and minutes are honest
            estimates. Cells with fewer than 5 reports are hidden.{" "}
            <Link
              href="/results/data.json"
              className="text-brand hover:underline"
            >
              Download the raw data
            </Link>
            .
          </div>

          {empty ? (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 className="text-lg font-medium tracking-tight">
                No reports yet — be the first
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Run{" "}
                <code className="font-mono text-foreground">
                  omot bench start &lt;task&gt;
                </code>
                , let your coding agent work, then{" "}
                <code className="font-mono text-foreground">
                  omot bench verify
                </code>{" "}
                and{" "}
                <code className="font-mono text-foreground">omot report</code>.
                Every table below still renders with n = 0.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Total reports", String(aggregate.total)],
              [
                "Overall pass rate",
                aggregate.overall.enough
                  ? `${Math.round((aggregate.overall.pass_rate ?? 0) * 100)}%`
                  : "Not enough data yet",
              ],
              [
                "Median corrections",
                aggregate.overall.enough
                  ? String(aggregate.overall.median_corrections)
                  : "Not enough data yet",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="mt-1 text-2xl font-medium tracking-tight">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <StatsTable title="By task" groups={aggregate.by_task} />
          <StatsTable title="By readiness band" groups={aggregate.by_band} />

          <div>
            <h3 className="mb-3 text-lg font-medium tracking-tight">
              By coding agent
            </h3>
            <AgentTable groups={aggregate.by_agent} />
          </div>
        </div>
      </section>
    </>
  );
}
