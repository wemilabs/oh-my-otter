import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import type { Grade } from "@oh-my-otter/core";
import type { Group } from "@oh-my-otter/benchmarks/report";
import { StatusPill, Window } from "./terminal";

export function SectionHeading({
  eyebrow,
  muted,
  title,
  children,
}: {
  eyebrow?: string;
  muted?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? (
        <p className="mb-4 font-mono text-xs tracking-wider text-muted-foreground uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-h2 leading-[1.06] font-medium tracking-[-0.03em] text-balance">
        {muted ? <span className="block text-faint">{muted}</span> : null}
        {title}
      </h2>
      {children ? (
        <p className="mt-4 text-body leading-relaxed text-muted-foreground">
          {children}
        </p>
      ) : null}
    </div>
  );
}

export function StatsStrip({ reports }: { reports: number | null }) {
  const stats = [
    ["14", "readiness checks"],
    ["6", "benchmark tasks"],
    ["0", "network calls from the CLI"],
    [
      reports === null ? "—" : reports.toLocaleString("en-US"),
      "anonymous reports so far",
    ],
  ];
  return (
    <section className="border-b border-border">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 px-gutter lg:grid-cols-4">
        {stats.map(([value, label], i) => (
          <div
            key={label}
            className={`border-border px-5 py-7 sm:px-6 ${i % 2 === 1 ? "border-l" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}
          >
            <dd className="text-3xl font-medium tracking-tight">{value}</dd>
            <dt className="mt-1 text-sm text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BentoCard({
  title,
  body,
  children,
  className = "",
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={`flex flex-col ${className}`}>
      <div className="relative flex min-h-56 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-wash p-5 sm:p-7">
        {children}
      </div>
      <h3 className="mt-4 text-[17px] font-medium tracking-tight">{title}</h3>
      <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </article>
  );
}

export function Features() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-gutter py-section">
        <SectionHeading title="Everything a coding agent trips over, measured">
          Agents do their best work in repos with runnable tests, documented
          setup and fast feedback. Oh My Otter checks for all of it and proves
          the difference with real tasks.
        </SectionHeading>

        <div className="mt-14 grid gap-x-6 gap-y-12 md:grid-cols-2">
          <BentoCard
            title="A readiness score you can act on"
            body="Fourteen weighted checks cover setup, tests, linting, types, CI and docs. Every failure comes with a specific, fixable reason."
          >
            <div className="w-full max-w-sm space-y-2">
              {(
                [
                  ["package-manager-lockfile", "pass"],
                  ["node-version-pinned", "fail"],
                  ["tests-exist", "pass"],
                  ["formatter-config", "warn"],
                ] as const
              ).map(([id, status]) => (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 font-mono text-[13px] shadow-sm"
                >
                  {id}
                  <StatusPill status={status} />
                </div>
              ))}
            </div>
          </BentoCard>
          <BentoCard
            title="Benchmarks on your own code"
            body="Six standardized tasks, from bumping a dependency to fixing a failing test. Paste the prompt into any coding agent; the CLI verifies the result locally."
          >
            <Window
              title="omot bench list"
              className="w-full max-w-sm shadow-sm"
            >
              <ul className="divide-y divide-border font-mono text-[13px]">
                {[
                  "dep-patch-bump",
                  "add-unit-test",
                  "fix-lint-rule",
                  "a11y-img-alt",
                  "ts-strict-file",
                ].map((id) => (
                  <li
                    key={id}
                    className="flex items-center justify-between px-4 py-2"
                  >
                    {id}
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            </Window>
          </BentoCard>
        </div>

        <div className="mt-12 grid gap-x-6 gap-y-12 md:grid-cols-3">
          <BentoCard
            title="Create-only fixes"
            body="omot scan --fix previews the missing pieces and never overwrites a file you already have."
          >
            <pre className="w-full overflow-hidden rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed shadow-sm">
              <span className="text-success">+ .nvmrc</span>
              {"\n"}
              <span className="text-success">+ .env.example</span>
              {"\n"}
              <span className="text-success">+ AGENTS.md</span>
              {"\n"}
              <span className="text-muted-foreground">
                {" "}
                3 files, 0 overwritten
              </span>
            </pre>
          </BentoCard>
          <BentoCard
            title="Anonymous by design"
            body="Reports hold coarse fields only: no code, file names, repo details or usernames. You see the exact JSON first."
          >
            <pre className="w-full overflow-hidden rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed shadow-sm">
              {"{\n"}
              {'  "task_id": '}
              <span className="text-brand">{'"add-unit-test"'}</span>
              {",\n"}
              {'  "outcome": '}
              <span className="text-brand">{'"pass"'}</span>
              {",\n"}
              {'  "readiness_score": '}
              <span className="text-warning">82</span>
              {"\n}"}
            </pre>
          </BentoCard>
          <BentoCard
            title="An open dataset"
            body="Every accepted report is a plain JSON file in the repository. Download it, audit it, or build your own charts."
          >
            <div className="flex h-28 w-full max-w-56 items-end gap-2.5">
              {[38, 56, 72, 90].map((h, i) => (
                <div
                  key={h}
                  className="flex-1 rounded-t-md bg-brand"
                  style={{ height: `${h}%`, opacity: 0.35 + i * 0.2 }}
                />
              ))}
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Scan",
    body: "Get a readiness score and a list of specific findings in seconds. Gate it in CI with --min-score.",
    code: [
      "$ npx oh-my-otter scan",
      "",
      "Readiness 82 (B)",
      "  fail  lint-script",
      "  warn  install-documented",
    ],
    href: {
      label: "See the checks",
      url: "https://github.com/wemilabs/oh-my-otter#built-in-checks",
    },
  },
  {
    n: "02",
    title: "Benchmark",
    body: "Start a task, paste the prompt into your coding agent, then verify. You get pass, partial or fail with reasons, plus corrections and minutes.",
    code: [
      "$ omot bench start add-unit-test \\",
      "    --param file=src/format.ts \\",
      "    --param function=formatPrice",
      "$ omot bench verify",
      "  pass · 1 correction · 12 min",
    ],
    href: { label: "Browse tasks", url: "/tasks" },
  },
  {
    n: "03",
    title: "Report",
    body: "omot report prints the exact anonymous JSON and opens a prefilled GitHub issue only after you say yes.",
    code: [
      "$ omot report",
      "",
      "This is everything that will be shared:",
      '{ "task_id": "add-unit-test", ... }',
      "Open a GitHub issue with it? (y/N)",
    ],
    href: { label: "What gets shared", url: "/privacy" },
  },
];

export function Steps() {
  return (
    <section id="quickstart" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto max-w-6xl px-gutter py-section">
        <SectionHeading
          muted="From a fresh clone,"
          title="to evidence you can share"
        />
        <div className="mt-14 divide-y divide-border border-y border-border">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="grid gap-6 py-10 md:grid-cols-[1fr_1.15fr] md:gap-12"
            >
              <div>
                <div className="font-mono text-sm text-faint">{step.n}</div>
                <h3 className="mt-3 text-2xl font-medium tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-md leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
                <Link
                  href={step.href.url}
                  className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline"
                >
                  {step.href.label} <ChevronRight className="size-3.5" />
                </Link>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-border bg-wash p-5 font-mono text-[13px] leading-relaxed">
                {step.code.join("\n")}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ResultsTeaser({
  reports,
  bands,
  unavailable = false,
}: {
  reports: number;
  bands: Group<Grade>[];
  unavailable?: boolean;
}) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-gutter py-section lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <SectionHeading
          eyebrow="Results"
          title="Does a higher readiness score mean fewer corrections?"
        >
          The public results compare success rates and human effort across
          tasks, readiness grades and coding agents. Cells with fewer than five
          reports stay hidden until there is enough data.
        </SectionHeading>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Success rate by readiness grade</span>
            <span className="font-mono text-xs text-muted-foreground">
              n = {reports}
            </span>
          </div>
          {unavailable ? (
            <div className="mt-6 rounded-lg border border-dashed border-border bg-wash p-4 text-sm text-muted-foreground">
              Data temporarily unavailable — results refresh hourly.
            </div>
          ) : null}
          <div className="mt-6 space-y-3">
            {bands.map((band) => {
              const rate = band.stats.enough ? band.stats.pass_rate : null;
              return (
                <div key={band.key} className="flex items-center gap-3 text-sm">
                  <span className="w-4 font-medium">{band.key}</span>
                  {rate === null ? (
                    <div className="h-7 flex-1 rounded-md border border-dashed border-border bg-wash" />
                  ) : (
                    <div className="h-7 flex-1 rounded-md border border-border bg-wash">
                      <div
                        className="h-full rounded-md bg-brand/70"
                        style={{ width: `${Math.round(rate * 100)}%` }}
                      />
                    </div>
                  )}
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {rate === null ? (
                      <>
                        Not enough ·{" "}
                        <span className="font-mono">n={band.stats.n}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-mono">
                          {Math.round(rate * 100)}%
                        </span>{" "}
                        · n={band.stats.n}
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <Link
            href="/results"
            prefetch={true}
            className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            Explore all results <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-gutter py-section text-center">
        <h2 className="mx-auto max-w-2xl text-h2 leading-[1.06] font-medium tracking-[-0.03em] text-balance">
          Make your repo a place coding agents do their best work
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-body text-muted-foreground">
          One command, no account, no network calls.
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <a
            href="https://github.com/wemilabs/oh-my-otter#quickstart"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
          >
            Read the quickstart
          </a>
          <Link
            href="/results"
            prefetch={true}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-5 text-sm font-medium transition-colors hover:bg-accent"
          >
            See the results
          </Link>
        </div>
      </div>
    </section>
  );
}
