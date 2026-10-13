import type { Metadata } from "next";
import Link from "next/link";
import { SCORING_VERSION } from "@oh-my-otter/core";
import {
  BUILTIN_TASK_MANIFESTS,
  MIN_SAMPLE,
  SITE_URL,
} from "@oh-my-otter/benchmarks/report";
import { SectionHeading } from "@/components/landing/sections";
import { getCheckCatalog } from "@/lib/check-catalog";
import { gradeBands } from "@/lib/checks";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How repository readiness is scored, benchmark tasks are verified, and self-reported results are interpreted.",
  alternates: { canonical: `${SITE_URL}/methodology` },
};

const sectionClass = "scroll-mt-24 border-b border-border";
const contentClass = "mx-auto max-w-6xl space-y-5 px-gutter py-12 sm:py-14";
const paragraphClass =
  "max-w-3xl text-body leading-relaxed text-muted-foreground";

export default async function MethodologyPage() {
  const checks = await getCheckCatalog();
  const totalWeight = checks.reduce((total, check) => total + check.weight, 0);
  const bands = gradeBands();

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-12 sm:pt-section">
          <SectionHeading eyebrow="Methodology" title="What the results mean">
            The score and benchmark outcomes come from local checks and task
            verifiers. Public results are still self-reported, so sample sizes
            and limitations matter.
          </SectionHeading>
        </div>
      </section>

      <section className={sectionClass} id="scoring">
        <div className={contentClass}>
          <h2 className="text-h3 font-medium tracking-tight">
            Scoring formula
          </h2>
          <p className={paragraphClass}>
            Scoring version <span className="font-mono">{SCORING_VERSION}</span>{" "}
            gives each applicable check its weight as the maximum contribution.
            A pass earns its full weight and adds that full weight to the
            possible total. A warn earns and adds half its weight. A fail earns
            zero and adds the full weight. Not-applicable checks are excluded
            from both totals.
          </p>
          <p className={paragraphClass}>
            Score ={" "}
            <code className="rounded-md bg-wash px-1.5 py-0.5 font-mono text-sm text-foreground">
              Math.round(100 × earned ÷ possible)
            </code>
            . When possible is zero, the score is 0 and the grade is D.
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            {bands.map(({ grade, min, max }) => (
              <div
                key={grade}
                className="rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <div className="font-mono text-lg font-medium">{grade}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {min}–{max}
                </p>
              </div>
            ))}
          </div>
          <Link
            href="/docs/scoring"
            className="inline-flex min-h-11 items-center text-brand hover:underline"
          >
            Read the scoring documentation
          </Link>
        </div>
      </section>

      <section className={sectionClass} id="check-weights">
        <div className={contentClass}>
          <div>
            <h2 className="text-h3 font-medium tracking-tight">
              Check weights
            </h2>
            <p className={`${paragraphClass} mt-2`}>
              Each check contributes its displayed share of the total possible
              weight when applicable.
            </p>
          </div>
          <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm md:block">
            <table aria-label="Check weights" className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-wider text-muted-foreground uppercase">
                  <th className="px-5 py-3 font-medium">Check</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Weight</th>
                  <th className="px-5 py-3 font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {checks.map((check) => (
                  <tr key={check.id} data-check-weight-row>
                    <td className="px-5 py-2 font-mono text-[13px]">
                      <Link
                        href={`/checks/${check.id}`}
                        className="inline-flex min-h-11 items-center hover:underline"
                      >
                        {check.title}
                      </Link>
                    </td>
                    <td className="px-5 py-2 capitalize text-muted-foreground">
                      {check.category}
                    </td>
                    <td className="px-5 py-2 font-mono">{check.weight}</td>
                    <td className="px-5 py-2 font-mono">
                      {((check.weight / totalWeight) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-medium">
                  <th className="px-5 py-3 text-left">Total</th>
                  <td />
                  <td className="px-5 py-3 font-mono">{totalWeight}</td>
                  <td className="px-5 py-3 font-mono">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <ul className="grid gap-3 md:hidden">
            {checks.map((check) => (
              <li
                key={check.id}
                data-check-weight-row
                className="rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <Link
                  href={`/checks/${check.id}`}
                  className="inline-flex min-h-11 items-center font-medium hover:underline"
                >
                  {check.title}
                </Link>
                <div className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                  <span className="capitalize">{check.category}</span>
                  <span>Weight {check.weight}</span>
                  <span>
                    {((check.weight / totalWeight) * 100).toFixed(1)}%
                  </span>
                </div>
              </li>
            ))}
            <li className="rounded-lg border border-border bg-wash p-4 font-mono text-sm">
              Total weight: {totalWeight} · 100%
            </li>
          </ul>
          <Link
            href="/docs/scoring"
            className="inline-flex min-h-11 items-center text-brand hover:underline"
          >
            How check weights affect scores
          </Link>
        </div>
      </section>

      <section className={sectionClass} id="task-design">
        <div className={contentClass}>
          <h2 className="text-h3 font-medium tracking-tight">
            Benchmark task design and verification
          </h2>
          <p className={paragraphClass}>
            Each benchmark task defines objective pass, partial, and fail
            criteria and verifies the working result locally. At{" "}
            <code className="font-mono text-foreground">omot bench start</code>,
            each task checks its own preconditions; task-specific baseline
            scripts may run and their exit codes are recorded. Some tasks
            require a clean working tree or a passing baseline test. During
            verification, a script failure already present at baseline is not
            counted, unless that script is the task&apos;s explicit target.
          </p>
          <p className={paragraphClass}>
            Every verification attempt is appended to the run, and the report
            records the number of attempts. Changing a task&apos;s{" "}
            <code className="font-mono text-foreground">prompt.md</code> or{" "}
            <code className="font-mono text-foreground">verify.ts</code>{" "}
            requires a version bump; aggregates count only reports for the
            current task version.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BUILTIN_TASK_MANIFESTS.map((task) => (
              <li
                key={task.id}
                className="rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <Link
                  href={`/tasks/${task.id}`}
                  className="inline-flex min-h-11 items-center font-mono text-[13px] hover:underline"
                >
                  {task.id}
                </Link>
                <p className="text-sm text-muted-foreground">
                  Version {task.version}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link
              href="/docs/benchmarks"
              className="inline-flex min-h-11 items-center text-brand hover:underline"
            >
              Browse benchmark documentation
            </Link>
            <Link
              href="/docs/writing-a-task"
              className="inline-flex min-h-11 items-center text-brand hover:underline"
            >
              How tasks are written and verified
            </Link>
            <Link
              href="/tasks"
              className="inline-flex min-h-11 items-center text-brand hover:underline"
            >
              Browse benchmark tasks
            </Link>
          </div>
        </div>
      </section>

      <section className={sectionClass} id="self-reported">
        <div className={contentClass}>
          <h2 className="text-h3 font-medium tracking-tight">
            Limits of self-reported data
          </h2>
          <p className={paragraphClass}>
            Verification runs on the submitter&apos;s machine. Agent name and
            version, model, human corrections, and minutes are reported claims,
            not independently observed measurements. Forged or misleading
            reports are possible. Ingest validates a strict schema and applies
            rate limits, and maintainers can remove report lines from the
            dataset.
          </p>
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center text-brand hover:underline"
          >
            See the privacy and report data details
          </Link>
        </div>
      </section>

      <section className={sectionClass} id="biases">
        <div className={contentClass}>
          <h2 className="text-h3 font-medium tracking-tight">Known biases</h2>
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-body leading-relaxed text-muted-foreground">
            <li>
              People choose whether to submit, and successful runs may be more
              likely to be reported.
            </li>
            <li>Submitters choose which repositories and tasks to run.</li>
            <li>Agent versions change over time.</li>
            <li>Small samples can move rates substantially.</li>
            <li>
              Readiness bands are confounded by the repository&apos;s stack and
              type; they do not establish that readiness caused an outcome.
            </li>
            <li>Human minutes are self-estimated.</li>
            <li>
              The current task set is small and focused on JavaScript and
              TypeScript repositories.
            </li>
          </ul>
        </div>
      </section>

      <section className="border-b border-border" id="sample-size">
        <div className={contentClass}>
          <h2 className="text-h3 font-medium tracking-tight">
            Minimum sample and ranking
          </h2>
          <p className={paragraphClass}>
            A cell with fewer than {MIN_SAMPLE} reports is shown as{" "}
            <strong className="font-medium text-foreground">
              Not enough data yet
            </strong>
            . Unknown agents are grouped as Other and are never ranked. Among
            named agents that meet the minimum sample, ordering uses pass rate;
            sample size is always shown.
          </p>
          <Link
            href="/results"
            className="inline-flex min-h-11 items-center text-brand hover:underline"
          >
            Explore results
          </Link>
        </div>
      </section>
    </>
  );
}
