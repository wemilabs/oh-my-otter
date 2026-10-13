import type { Metadata } from "next";
import { SITE_URL } from "@oh-my-otter/benchmarks/report";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SectionHeading } from "@/components/landing/sections";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Exactly what omot report sends: the complete anonymous payload, and everything it never collects.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

function repoRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.join(process.cwd(), "../..");
    dir = parent;
  }
}

export default function PrivacyPage() {
  const markdown = readFileSync(path.join(repoRoot(), "PRIVACY.md"), "utf8");
  return (
    <section>
      <div className="mx-auto max-w-3xl px-gutter pt-[calc(var(--spacing-section)*0.6)] pb-20 sm:pt-section">
        <SectionHeading
          eyebrow="Privacy"
          title="Exactly what omot report sends"
        />
        <div className="prose-omot mt-10">
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="mt-10 mb-4 text-3xl font-medium tracking-tight">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="mt-10 mb-3 text-2xl font-medium tracking-tight">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-8 mb-3 text-xl font-medium tracking-tight">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="my-4 leading-relaxed text-muted-foreground">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="my-4 list-disc space-y-1.5 pl-5 text-muted-foreground">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="my-4 list-decimal space-y-1.5 pl-5 text-muted-foreground">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="leading-relaxed">{children}</li>
              ),
              a: ({ children, href }) => (
                <a href={href} className="text-brand hover:underline">
                  {children}
                </a>
              ),
              strong: ({ children }) => (
                <strong className="font-medium text-foreground">
                  {children}
                </strong>
              ),
              code: ({ children, className }) =>
                className ? (
                  <code className={className}>{children}</code>
                ) : (
                  <code className="rounded-md bg-wash px-1 py-0.5 font-mono text-[0.85em] text-foreground">
                    {children}
                  </code>
                ),
              pre: ({ children }) => (
                <pre className="my-5 overflow-x-auto rounded-lg border border-border bg-wash p-5 font-mono text-[13px] leading-relaxed">
                  {children}
                </pre>
              ),
            }}
          >
            {markdown}
          </Markdown>
        </div>
      </div>
    </section>
  );
}
