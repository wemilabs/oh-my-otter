import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BUILTIN_TASK_MANIFESTS } from "@oh-my-otter/benchmarks/report";
import { SectionHeading } from "@/components/landing/sections";
import { AgentTable, StatsTable } from "@/components/results/stats";
import { getDataset } from "@/lib/dataset";

export const dynamicParams = false;

export function generateStaticParams() {
  return BUILTIN_TASK_MANIFESTS.map((task) => ({ id: task.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/tasks/[id]">): Promise<Metadata> {
  const { id } = await params;
  const task = BUILTIN_TASK_MANIFESTS.find((t) => t.id === id);
  if (!task) return {};
  return { title: task.id, description: task.title };
}

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const task = BUILTIN_TASK_MANIFESTS.find((t) => t.id === id);
  if (!task) notFound();
  const { aggregate } = getDataset();
  const start = `omot bench start ${task.id}${task.params
    .map((param) => ` --param ${param.name}=${param.example}`)
    .join("")}`;
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 pt-16 pb-12 sm:px-8 sm:pt-24">
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
        <div className="mx-auto max-w-6xl space-y-10 px-5 py-14 sm:px-8">
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

          <StatsTable
            title="Results by readiness band"
            groups={aggregate.by_task_band[task.id] ?? []}
          />
          <div>
            <h3 className="mb-3 text-lg font-medium tracking-tight">
              Results by coding agent
            </h3>
            <AgentTable groups={aggregate.by_task_agent[task.id] ?? []} />
          </div>
        </div>
      </section>
    </>
  );
}
