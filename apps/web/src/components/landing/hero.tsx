import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CopyCommand } from "./copy-command";
import { StatusPill, Window, type Status } from "./terminal";

const SCAN_ROWS: Array<[string, Status, string]> = [
  ["tests-pass", "pass", "Test script exits 0"],
  ["lint-script", "fail", "No lint script in package.json"],
  ["typecheck-script", "pass", "tsc --noEmit is wired up"],
  ["install-documented", "warn", "README mentions install, not a command"],
  ["ci-config", "pass", "GitHub Actions workflow found"],
  ["env-example", "na", "No env variables referenced"],
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="mx-auto max-w-6xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-14 sm:pt-section">
        <div className="max-w-3xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            Open source · runs entirely on your machine
          </p>
          <h1 className="text-display leading-[1.04] font-medium tracking-[-0.03em] text-balance">
            Find out how ready your repo is for any coding agent
          </h1>
          <p className="mt-5 max-w-xl text-body leading-relaxed text-muted-foreground">
            Scan for the things coding agents trip over, benchmark your agent on
            standardized tasks in your own codebase, and compare anonymous
            results from everyone else.
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              href="/results"
              prefetch={true}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
            >
              See the results <ArrowRight className="size-4" />
            </Link>
            <CopyCommand command="npx oh-my-otter scan" />
          </div>
        </div>

        <div className="relative mt-16">
          <HeroBackdrop />
          <div className="relative grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-start">
            <Window title="~/projects/storefront · omot scan">
              <div className="grid min-w-0 gap-5 p-5 sm:grid-cols-[150px_1fr] sm:p-6">
                <div className="flex flex-row flex-wrap items-center gap-4 sm:flex-col sm:items-start">
                  <div className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                    Readiness
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-medium tracking-tight">
                      82
                    </span>
                    <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-sm font-semibold text-brand">
                      B
                    </span>
                  </div>
                  <div className="h-1.5 w-32 max-w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full w-[82%] rounded-full bg-brand" />
                  </div>
                </div>
                <ul className="min-w-0 divide-y divide-border font-mono text-[13px]">
                  {SCAN_ROWS.map(([id, status, reason]) => (
                    <li key={id} className="flex items-center gap-3 py-2">
                      <StatusPill status={status} />
                      <span className="min-w-0 flex-1 truncate">{id}</span>
                      <span className="hidden truncate text-muted-foreground md:inline">
                        {reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Window>

            <div className="grid gap-5 lg:mt-12">
              <Window title="omot bench verify">
                <div className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm">add-unit-test</span>
                    <StatusPill status="pass" />
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    {[
                      ["Corrections", "1"],
                      ["Minutes", "12"],
                      ["Attempts", "1"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-wash p-3">
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="mt-1 text-xl font-medium tracking-tight">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </Window>
              <div className="rounded-xl border border-border bg-card/90 p-4 text-sm shadow-sm backdrop-blur">
                <div className="flex items-center gap-2 font-medium">
                  <span className="size-1.5 rounded-full bg-brand" />
                  Nothing leaves your machine
                </div>
                <p className="mt-1 text-muted-foreground">
                  Until you run{" "}
                  <code className="font-mono text-foreground">omot report</code>{" "}
                  and confirm the exact JSON.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -inset-x-24 -inset-y-10"
    >
      <div className="absolute top-0 left-[8%] h-40 w-56 rounded-3xl bg-brand/15 blur-2xl" />
      <div className="absolute top-24 right-[4%] h-48 w-64 rounded-3xl bg-violet/15 blur-2xl" />
      <div className="absolute bottom-0 left-[35%] h-36 w-72 rounded-3xl bg-success/12 blur-2xl" />
      <div className="absolute right-[30%] -bottom-6 h-24 w-40 rounded-3xl bg-warning/12 blur-2xl" />
    </div>
  );
}
