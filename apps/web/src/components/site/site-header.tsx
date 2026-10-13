import Link from "next/link";
import { Logo } from "./logo";
import { NAV_LINKS } from "./links";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";
import { GitHubStars } from "./github-stars";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="relative mx-auto flex h-14 max-w-6xl items-center gap-4 px-gutter-safe">
        <MobileNav />
        <Logo />
        <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={link.href === "/results"}
              className="inline-flex min-h-11 items-center px-2.5 transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center">
          <ThemeToggle />
          <div className="sm:mx-1">
            <GitHubStars />
          </div>
          <div className="ml-1">
            <Link
              href="/#quickstart"
              className="group -mr-1 inline-flex min-h-11 shrink-0 items-center"
            >
              <span className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity group-hover:opacity-85">
                Get started
              </span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
