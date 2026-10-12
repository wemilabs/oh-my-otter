import Link from "next/link";
import { LogoMark } from "./logo";
import { NAV_LINKS, REPO_URL } from "./links";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="max-w-sm space-y-2">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <LogoMark className="size-4" /> Oh My Otter
          </div>
          <p>
            Open-source and independent. Not affiliated with or endorsed by any
            coding agent vendor.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/results/data.json" className="hover:text-foreground">
            Raw data
          </Link>
          <a href={REPO_URL} className="hover:text-foreground">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
