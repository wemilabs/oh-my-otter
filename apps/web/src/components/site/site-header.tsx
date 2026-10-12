import Link from "next/link";
import { Logo } from "./logo";
import { NAV_LINKS, REPO_URL } from "./links";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <a
            href={REPO_URL}
            className="hidden h-8 items-center rounded-full border border-border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-accent sm:inline-flex"
          >
            GitHub
          </a>
          <Link
            href="/#quickstart"
            className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
          >
            Get started
          </Link>
        </div>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-5 pb-2.5 text-sm text-muted-foreground md:hidden">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
