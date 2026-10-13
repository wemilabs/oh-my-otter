import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { builtinChecks } from "@oh-my-otter/checks";
import { SITE_URL } from "@oh-my-otter/benchmarks/report";
import { SectionHeading } from "@/components/landing/sections";
import { getCheckCatalog } from "@/lib/check-catalog";
import { REPO_URL } from "@/components/site/links";

export const instant = true;

export function generateStaticParams() {
  return builtinChecks.map((check) => ({ id: check.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/checks/[id]">): Promise<Metadata> {
  const { id } = await params;
  const check = builtinChecks.find((entry) => entry.id === id);
  if (!check) notFound();
  return {
    title: check.title,
    description: check.why,
    alternates: { canonical: `${SITE_URL}/checks/${id}` },
  };
}

export default async function CheckPage({ params }: PageProps<"/checks/[id]">) {
  const { id } = await params;
  if (!builtinChecks.some((entry) => entry.id === id)) notFound();
  return (
    <Suspense fallback={<CheckPageSkeleton />}>
      <CheckContent id={id} />
    </Suspense>
  );
}

async function CheckContent({ id }: { id: string }) {
  const catalog = await getCheckCatalog();
  const check = catalog.find((entry) => entry.id === id);
  if (!check) notFound();
  const totalWeight = catalog.reduce((total, entry) => total + entry.weight, 0);
  const share = ((check.weight / totalWeight) * 100).toFixed(1);

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-12 sm:pt-section">
          <SectionHeading eyebrow={check.category} title={check.title}>
            <span className="font-mono text-base">{check.id}</span> · weight{" "}
            {check.weight} ({share}% of total)
          </SectionHeading>
        </div>
      </section>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl space-y-10 px-gutter py-14">
          <div>
            <h3 className="mb-3 text-lg font-medium tracking-tight">
              Why it matters for coding agents
            </h3>
            <p className="max-w-3xl text-body leading-relaxed text-muted-foreground">
              {check.why}
            </p>
          </div>
          <div>
            <h3 className="mb-3 text-lg font-medium tracking-tight">
              How to pass
            </h3>
            <p className="max-w-3xl text-body leading-relaxed text-muted-foreground">
              {check.howToPass ??
                "Run omot scan for guidance specific to your repository."}
            </p>
          </div>
          <div>
            <h3 className="mb-3 text-lg font-medium tracking-tight">
              <code className="font-mono text-[0.9em]">omot scan --fix</code>
            </h3>
            {check.fixCreates.length > 0 ? (
              <>
                <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                  This create-only fix can create these files if they are
                  missing. It never overwrites existing files.
                </p>
                <ul className="flex flex-wrap gap-2">
                  {check.fixCreates.map((path) => (
                    <li
                      key={path}
                      className="rounded-md bg-wash px-3 py-2 font-mono text-[13px]"
                    >
                      {path}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                --fix doesn&apos;t create a file for this check. Any suggested
                change is shown for you to review; --fix never overwrites.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm">
            <Link
              href="/methodology"
              className="min-h-11 text-brand hover:underline"
            >
              Scoring methodology
            </Link>
            <a
              href={`${REPO_URL}/blob/main/packages/checks/src/checks/${check.id}.ts`}
              className="inline-flex min-h-11 items-center text-brand hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              View check source
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-foreground/10 motion-reduce:animate-none ${className}`}
    />
  );
}

function CheckPageSkeleton() {
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
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index}>
              <SkeletonBar className="mb-3 h-6 w-48" />
              <SkeletonBar className="h-16 w-full max-w-3xl" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
