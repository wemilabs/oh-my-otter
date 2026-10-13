import type { Metadata } from "next";
import Link from "next/link";
import {
  BUILTIN_TASK_MANIFESTS,
  SITE_URL,
} from "@oh-my-otter/benchmarks/report";
import { builtinChecks } from "@oh-my-otter/checks";
import { SectionHeading } from "@/components/landing/sections";
import { REPO_URL } from "@/components/site/links";

export const metadata: Metadata = {
  title: "Contribute",
  description:
    "Help improve Oh My Otter by proposing checks, benchmark tasks, reports, or bug fixes.",
  alternates: { canonical: `${SITE_URL}/contribute` },
};

const ISSUE_URL = `${REPO_URL}/issues/new?template=`;
const linkClass =
  "inline-flex min-h-11 items-center text-brand hover:underline";
const cardClass = "rounded-lg border border-border bg-card p-5 shadow-sm";

export default function ContributePage() {
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-12 sm:pt-section">
          <SectionHeading eyebrow="Contribute" title="Make the toolkit better">
            Check and task proposals, reports, and bug fixes make the guidance
            more useful for every coding agent and repository.
          </SectionHeading>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl space-y-12 px-gutter py-14">
          <article className={cardClass}>
            <h2 className="text-h3 font-medium tracking-tight">Add a check</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              There are currently {builtinChecks.length} built-in checks.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>
                Create{" "}
                <code className="font-mono break-words text-foreground">
                  packages/checks/src/checks/&lt;id&gt;.ts
                </code>{" "}
                with a deterministic, read-only check.
              </li>
              <li>
                Add its named re-export to{" "}
                <code className="font-mono break-words text-foreground">
                  packages/checks/src/registry.ts
                </code>
                .
              </li>
              <li>Add a row to the README built-in checks table.</li>
              <li>
                Add tests for the check and update the relevant expected counts,
                statuses, and scores.
              </li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/docs/writing-a-check" className={linkClass}>
                Read the writing-a-check guide
              </Link>
              <a
                href={`${ISSUE_URL}new-check.yml`}
                className={linkClass}
                target="_blank"
                rel="noreferrer"
              >
                Propose a check
              </a>
              <a
                href={`${REPO_URL}/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20check%22`}
                className={linkClass}
                target="_blank"
                rel="noreferrer"
              >
                Good first check issues
              </a>
            </div>
          </article>

          <article className={cardClass}>
            <h2 className="text-h3 font-medium tracking-tight">
              Add a benchmark task
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              There are currently {BUILTIN_TASK_MANIFESTS.length} built-in
              tasks.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>
                Create{" "}
                <code className="font-mono break-words text-foreground">
                  packages/benchmarks/src/tasks/&lt;id&gt;/
                </code>{" "}
                with{" "}
                <code className="font-mono text-foreground">task.json</code>,{" "}
                <code className="font-mono text-foreground">prompt.md</code>,
                and <code className="font-mono text-foreground">verify.ts</code>
                .
              </li>
              <li>
                Add the task to{" "}
                <code className="font-mono break-words text-foreground">
                  packages/benchmarks/src/registry.ts
                </code>
                .
              </li>
              <li>
                Add its benchmark documentation page and tests for pass,
                partial, and fail.
              </li>
              <li>
                Bump the task&apos;s version whenever its prompt or verifier
                changes.
              </li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/docs/writing-a-task" className={linkClass}>
                Read the writing-a-task guide
              </Link>
              <a
                href={`${ISSUE_URL}new-task.yml`}
                className={linkClass}
                target="_blank"
                rel="noreferrer"
              >
                Propose a task
              </a>
            </div>
          </article>

          <article className={cardClass}>
            <h2 className="text-h3 font-medium tracking-tight">
              Submit a benchmark report
            </h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>
                Run{" "}
                <code className="font-mono text-foreground">
                  omot bench start &lt;task&gt;
                </code>
                .
              </li>
              <li>Let a coding agent work on the task.</li>
              <li>
                Run{" "}
                <code className="font-mono text-foreground">
                  omot bench verify
                </code>
                .
              </li>
              <li>
                Run{" "}
                <code className="font-mono text-foreground">omot report</code>.
                It prints the report JSON and asks before opening a prefilled
                issue; nothing is submitted without your confirmation.
              </li>
            </ol>
            <Link href="/privacy" className={`${linkClass} mt-4`}>
              Review what a report contains
            </Link>
          </article>

          <article className={cardClass}>
            <h2 className="text-h3 font-medium tracking-tight">Report a bug</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Include what you expected, what happened, and the command or page
              involved. Report security vulnerabilities privately as described
              in SECURITY.md.
            </p>
            <a
              href={`${ISSUE_URL}bug.yml`}
              className={`${linkClass} mt-3`}
              target="_blank"
              rel="noreferrer"
            >
              Open a bug report
            </a>
          </article>

          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm">
            <a
              href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
              className={linkClass}
              target="_blank"
              rel="noreferrer"
            >
              Full contributing guide
            </a>
            <a
              href={`${REPO_URL}/blob/main/CONTRIBUTING.md#pull-requests`}
              className={linkClass}
              target="_blank"
              rel="noreferrer"
            >
              Pull requests target v1-dev
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
