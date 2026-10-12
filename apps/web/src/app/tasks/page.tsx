import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  BUILTIN_TASK_MANIFESTS,
  SITE_URL,
} from "@oh-my-otter/benchmarks/report";
import { SectionHeading } from "@/components/landing/sections";
import {
  DataUnavailable,
  formatRate,
  NotEnough,
} from "@/components/results/stats";
import { getDataset } from "@/lib/dataset";

export const metadata: Metadata = {
  title: "Benchmark tasks",
  description:
    "The six standardized omot bench tasks: what each one asks a coding agent to do, its parameters, and its results so far.",
  alternates: { canonical: `${SITE_URL}/tasks` },
};

export default async function TasksPage() {
  const { dataset, aggregate } = await getDataset();
  const statsByTask = new Map(
    aggregate.by_task.map((group) => [group.key, group.stats]),
  );
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-12 sm:pt-section">
          <SectionHeading eyebrow="Benchmarks" title="Six standardized tasks">
            Each task is a small, well-scoped change verified locally by the
            CLI. Paste the prompt into any coding agent, then omot bench verify
            scores pass, partial, or fail.
          </SectionHeading>
        </div>
      </section>
      <section>
        <div className="mx-auto max-w-6xl px-gutter pt-14">
          {dataset.status === "unavailable" ? <DataUnavailable /> : null}
        </div>
        <div className="mx-auto grid max-w-6xl gap-5 px-gutter py-14 sm:grid-cols-2 lg:grid-cols-3">
          {BUILTIN_TASK_MANIFESTS.map((task) => {
            const stats = statsByTask.get(task.id)!;
            return (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                prefetch={true}
                className="group flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px]">{task.id}</span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <h3 className="mt-3 text-[17px] font-medium tracking-tight">
                  {task.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {task.category} · {task.estimatedScope}
                </p>
                <div className="mt-4 flex items-center gap-3 border-t border-border pt-4 font-mono text-[13px] text-muted-foreground">
                  {dataset.status === "unavailable" ? (
                    <span aria-label="results unavailable">—</span>
                  ) : (
                    <>
                      <span>n={stats.n}</span>
                      <span>
                        {stats.enough ? (
                          `${formatRate(stats.pass_rate)} pass`
                        ) : (
                          <NotEnough />
                        )}
                      </span>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
