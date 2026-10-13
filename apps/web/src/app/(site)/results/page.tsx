import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import {
  BUILTIN_TASK_MANIFESTS,
  SITE_URL,
} from "@oh-my-otter/benchmarks/report";
import { SectionHeading } from "@/components/landing/sections";
import {
  AgentTable,
  DataUnavailable,
  StatsTable,
} from "@/components/results/stats";
import {
  OutcomeChart,
  SuccessRateChart,
  TaskChartCaption,
} from "@/components/results/charts";
import { chartHeightForRows } from "@/lib/charts";
import { getDataset } from "@/lib/dataset";

export const instant = true;

export const metadata: Metadata = {
  title: "Results",
  description:
    "Anonymous, self-reported omot bench results aggregated by task, readiness band, and coding agent.",
  alternates: { canonical: `${SITE_URL}/results` },
};

export default function ResultsPage() {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-12 sm:pt-section">
          <SectionHeading eyebrow="Results" title="Anonymous benchmark results">
            Aggregated from reports submitted with omot report, always with the
            sample size n. Cells with fewer than five reports are hidden.
          </SectionHeading>
        </div>
      </section>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl space-y-10 px-gutter py-14">
          <p className="rounded-lg border border-border bg-wash p-5 text-sm leading-relaxed text-muted-foreground">
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
          </p>

          <Suspense fallback={<ResultsStatsSkeleton />}>
            <ResultsStats />
          </Suspense>
        </div>
      </section>
    </>
  );
}

async function ResultsStats() {
  const { dataset, aggregate } = await getDataset();
  if (dataset.status === "unavailable") {
    return <DataUnavailable />;
  }
  const empty = aggregate.total === 0;
  return (
    <>
      {empty ? (
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-medium tracking-tight">
            No reports yet — be the first
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Run{" "}
            <code className="font-mono text-foreground">
              omot bench start &lt;task&gt;
            </code>
            , let your coding agent work, then{" "}
            <code className="font-mono text-foreground">omot bench verify</code>{" "}
            and <code className="font-mono text-foreground">omot report</code>.
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
            className="rounded-lg border border-border bg-card p-5 shadow-sm"
          >
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-medium tracking-tight">
              {value}
            </div>
          </div>
        ))}
      </div>

      {!empty ? (
        <section aria-labelledby="charts-heading" className="space-y-5">
          <h3
            id="charts-heading"
            className="text-h3 font-medium tracking-tight"
          >
            Charts
          </h3>
          <div className="grid gap-5 lg:grid-cols-2">
            <SuccessRateChart
              caption="Pass rate by readiness band"
              groups={aggregate.by_band}
            />
            <SuccessRateChart
              caption="Pass rate by task"
              groups={aggregate.by_task}
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {BUILTIN_TASK_MANIFESTS.map((task) => (
              <OutcomeChart
                key={task.id}
                caption={<TaskChartCaption id={task.id} title={task.title} />}
                groups={aggregate.by_task_agent[task.id] ?? []}
              />
            ))}
          </div>
        </section>
      ) : null}

      {aggregate.excluded_other_versions > 0 ? (
        <p className="text-sm text-muted-foreground">
          {aggregate.excluded_other_versions === 1
            ? "1 report from another task version isn't counted."
            : `${aggregate.excluded_other_versions} reports from other task versions aren't counted.`}
        </p>
      ) : null}

      <StatsTable
        title="By task"
        groups={aggregate.by_task}
        linkPrefix="/tasks/"
      />
      <StatsTable title="By readiness band" groups={aggregate.by_band} />

      <div>
        <h3 className="mb-3 text-lg font-medium tracking-tight">
          By coding agent
        </h3>
        <AgentTable groups={aggregate.by_agent} />
      </div>
    </>
  );
}

function SkeletonBar({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-foreground/10 motion-reduce:animate-none ${className}`}
      style={style}
    />
  );
}

function ChartSkeleton({ rows }: { rows: number }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-5 shadow-sm">
      <SkeletonBar className="h-4 w-40" />
      <SkeletonBar
        className="mt-4 w-full"
        style={{ height: chartHeightForRows(rows) }}
      />
    </div>
  );
}

function StatsTableSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4 text-sm font-medium">
        {title}
      </div>
      <div className="divide-y divide-border px-5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 py-4">
            <SkeletonBar className="h-4 w-28" />
            <SkeletonBar className="h-4 w-8" />
            <SkeletonBar className="h-4 flex-1" />
            <SkeletonBar className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsStatsSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {["Total reports", "Overall pass rate", "Median corrections"].map(
          (label) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
            >
              <div className="text-sm text-muted-foreground">{label}</div>
              <SkeletonBar className="mt-2 h-7 w-16" />
            </div>
          ),
        )}
      </div>
      <section aria-hidden="true" className="space-y-5">
        <SkeletonBar className="h-8 w-24" />
        <div className="grid gap-5 lg:grid-cols-2">
          <ChartSkeleton rows={4} />
          <ChartSkeleton rows={BUILTIN_TASK_MANIFESTS.length} />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: BUILTIN_TASK_MANIFESTS.length }, (_, i) => (
            <ChartSkeleton key={i} rows={2} />
          ))}
        </div>
      </section>
      <StatsTableSkeleton title="By task" rows={6} />
      <StatsTableSkeleton title="By readiness band" rows={4} />
      <div>
        <h3 className="mb-3 text-lg font-medium tracking-tight">
          By coding agent
        </h3>
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-5 shadow-sm">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 py-4">
              <SkeletonBar className="h-4 w-32" />
              <SkeletonBar className="h-4 w-10" />
              <SkeletonBar className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
