"use client";

import Link from "next/link";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import type { CheckEntry } from "@/lib/checks";

const CATEGORIES = ["setup", "verification", "docs", "hygiene"] as const;
type CategoryFilter = "all" | (typeof CATEGORIES)[number];

export function CheckCatalog({ checks }: { checks: CheckEntry[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const fuse = useMemo(
    () =>
      new Fuse(checks, {
        keys: ["id", "title", "why", "howToPass", "category"],
        ignoreLocation: true,
        threshold: 0.35,
      }),
    [checks],
  );
  const searched = query.trim()
    ? fuse.search(query.trim()).map(({ item }) => item)
    : checks;
  const filtered =
    category === "all"
      ? searched
      : searched.filter((check) => check.category === category);

  const counts = new Map<string, number>();
  for (const check of checks) {
    counts.set(check.category, (counts.get(check.category) ?? 0) + 1);
  }

  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label
            htmlFor="check-search"
            className="mb-2 block text-sm font-medium"
          >
            Search checks
          </label>
          <input
            id="check-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or purpose"
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div
          role="group"
          aria-label="Filter checks by category"
          className="flex flex-wrap gap-x-2"
        >
          {(["all", ...CATEGORIES] as const).map((value) => {
            const count =
              value === "all" ? checks.length : (counts.get(value) ?? 0);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
                className="group inline-flex min-h-11 items-center text-sm capitalize outline-none"
              >
                <span className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 transition-colors group-hover:bg-accent group-focus-visible:ring-3 group-focus-visible:ring-ring/50 group-aria-pressed:bg-primary group-aria-pressed:text-primary-foreground">
                  {value === "all" ? "All" : value}{" "}
                  <span className="font-mono text-xs opacity-70">{count}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p aria-live="polite" className="mt-6 text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "check" : "checks"}
      </p>

      {filtered.length > 0 ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {filtered.map((check) => (
            <li key={check.id}>
              <Link
                href={`/checks/${check.id}`}
                className="group flex h-full min-h-44 flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:bg-accent"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-[13px]">{check.id}</span>
                  <span className="inline-flex min-h-6 items-center rounded-md bg-secondary px-2 text-xs capitalize text-muted-foreground">
                    {check.category}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-medium tracking-tight group-hover:underline">
                  {check.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {check.why}
                </p>
                <p className="mt-4 border-t border-border pt-3 font-mono text-[13px] text-muted-foreground">
                  Weight {check.weight}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-wash p-6 text-sm text-muted-foreground">
          No checks match this search. Try another term or category.
        </div>
      )}
    </div>
  );
}
