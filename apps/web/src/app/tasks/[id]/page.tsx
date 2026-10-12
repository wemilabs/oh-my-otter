import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
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
import { getDataset } from "@/lib/dataset";

export const instant = true;

export function generateStaticParams() {
  return BUILTIN_TASK_MANIFESTS.map((task) => ({ id: task.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/tasks/[id]">): Promise<Metadata> {
  const { id } = await params;
  const task = BUILTIN_TASK_MANIFESTS.find((t) => t.id === id);
  if (!task) return {};
  return {
    title: task.id,
    description: task.title,
    alternates: { canonical: `${SITE_URL}/tasks/${task.id}` },
  };
}

export default function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <Suspense fallback={<TaskPageSkeleton />}>
      <TaskContent params={params} />
    </Suspense>
  );
}

async function TaskContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = BUILTIN_TASK_MANIFESTS.find((t) => t.id === id);
  if (!task) notFound();
  const start = `omot bench start ${task.id}${task.params
    .map((param) => ` --param ${param.name}=${param.example}`)
    .join("")}`;
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-12 sm:pt-section">
          <SectionHeading
            eyebrow={`${task.category} · ${task.estimatedScope}`}
            title={task.title}
          >
            <span className="font-mono text-base">{task.id}</span> · v
            {task.version}
          </SectionHeading>
        </div>
      </section>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl space-y-10 px-gutter py-14">
          <div>
            <h3 className="mb-3 text-lg font-medium tracking-tight">Start</h3>
            <pre className="overflow-x-auto rounded-xl border border-border bg-wash p-5 font-mono text-[13px] leading-relaxed">
              {start}
            </pre>
          </div>

          {task.params.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4 text-sm font-medium">
                Parameters
              </div>
              <div
                role="region"
                aria-label={`Parameters for ${task.id}`}
                tabIndex={0}
                className="overflow-x-auto"
              >
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {task.params.map((param) => (
                      <tr key={param.name}>
                        <td className="px-5 py-3 font-mono text-[13px]">
                          {param.name}
                        </td>
                        <td className="px-5 py-3 font-mono text-[13px] text-muted-foreground">
                          {param.kind}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {param.description} e.g.{" "}
                          <code className="font-mono text-foreground">
                            {param.example}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="mb-3 text-lg font-medium tracking-tight">
              Preconditions
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {task.preconditions.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4 text-sm font-medium">
              Outcome criteria
            </div>
            <dl className="divide-y divide-border text-sm">
              {(
                [
                  ["pass", task.criteria.pass],
                  ["partial", task.criteria.partial],
                  ["fail", task.criteria.fail],
                ] as const
              ).map(([outcome, criteria]) => (
                <div key={outcome} className="px-5 py-4">
                  <dt className="font-mono text-[13px] font-medium uppercase">
                    {outcome}
                  </dt>
                  <dd className="mt-1 leading-relaxed text-muted-foreground">
                    {criteria}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <Suspense fallback={<TaskStatsSkeleton />}>
            <TaskStats id={task.id} />
          </Suspense>
        </div>
      </section>
    </>
  );
}

async function TaskStats({ id }: { id: string }) {
  const { dataset, aggregate } = await getDataset();
  if (dataset.status === "unavailable") {
    return <DataUnavailable />;
  }
  return (
    <>
      <StatsTable
        title="Results by readiness band"
        groups={aggregate.by_task_band[id] ?? []}
      />
      <div>
        <h3 className="mb-3 text-lg font-medium tracking-tight">
          Results by coding agent
        </h3>
        <AgentTable groups={aggregate.by_task_agent[id] ?? []} />
      </div>
    </>
  );
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-foreground/10 motion-reduce:animate-none ${className}`}
    />
  );
}

function StatsBlockSkeleton({ title }: { title: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4 text-sm font-medium">
        {title}
      </div>
      <div className="divide-y divide-border px-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 py-4">
            <SkeletonBar className="h-4 w-20" />
            <SkeletonBar className="h-4 w-8" />
            <SkeletonBar className="h-4 flex-1" />
            <SkeletonBar className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskStatsSkeleton() {
  return (
    <>
      <StatsBlockSkeleton title="Results by readiness band" />
      <div>
        <h3 className="mb-3 text-lg font-medium tracking-tight">
          Results by coding agent
        </h3>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card px-5 shadow-sm">
          {Array.from({ length: 3 }, (_, i) => (
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

function TaskPageSkeleton() {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-12 sm:pt-section">
          <SkeletonBar className="mb-4 h-3 w-24" />
          <SkeletonBar className="h-10 w-2/3" />
          <SkeletonBar className="mt-4 h-4 w-40" />
        </div>
      </section>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl space-y-10 px-gutter py-14">
          <div>
            <h3 className="mb-3 text-lg font-medium tracking-tight">Start</h3>
            <div className="rounded-xl border border-border bg-wash p-5">
              <SkeletonBar className="h-4 w-3/4" />
            </div>
          </div>
          <TaskStatsSkeleton />
        </div>
      </section>
    </>
  );
}
