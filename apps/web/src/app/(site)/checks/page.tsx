import type { Metadata } from "next";
import { SITE_URL } from "@oh-my-otter/benchmarks/report";
import { SectionHeading } from "@/components/landing/sections";
import { CheckCatalog } from "@/components/checks/check-catalog";
import { getCheckCatalog } from "@/lib/check-catalog";

export const metadata: Metadata = {
  title: "Repository readiness checks",
  description:
    "Browse and search the checks that measure repository readiness for coding agents.",
  alternates: { canonical: `${SITE_URL}/checks` },
};

export default async function ChecksPage() {
  const checks = await getCheckCatalog();
  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-12 sm:pt-section">
          <SectionHeading eyebrow="Repository readiness" title="Every check">
            Explore the checks behind the readiness score, how each one helps a
            coding agent, and what its create-only fix can generate.
          </SectionHeading>
        </div>
      </section>
      <section>
        <div className="mx-auto max-w-6xl px-gutter py-14">
          <CheckCatalog checks={checks} />
        </div>
      </section>
    </>
  );
}
