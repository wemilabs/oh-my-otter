import Link from "next/link";
import { LogoMark } from "./logo";
import { FOOTER_LINKS, REPO_URL } from "./links";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-gutter-safe py-10 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm space-y-2">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <LogoMark className="size-4" /> Oh My Otter
          </div>
          <p>
            Open-source and independent. Not affiliated with or endorsed by any
            coding agent vendor.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 min-w-11 items-center px-1 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={REPO_URL}
            className="inline-flex min-h-11 min-w-11 items-center px-1 hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
