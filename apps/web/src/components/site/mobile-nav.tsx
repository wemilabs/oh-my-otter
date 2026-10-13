"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_LINKS } from "./links";

export function MobileNav() {
  // The pathname the menu was opened on; navigating away closes it, so the
  // menu never stays open across routes (or back/forward through Activity).
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const open = openedOn === pathname;

  return (
    <div
      className="md:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpenedOn(null);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-card transition-colors hover:bg-accent"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpenedOn(open ? null : pathname)}
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {open ? (
        <nav
          id="mobile-nav"
          className="absolute inset-x-0 top-full border-b border-border bg-background px-gutter-safe pb-4 shadow-sm"
        >
          <ul className="divide-y divide-border">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  prefetch={link.href === "/results"}
                  onClick={() => setOpenedOn(null)}
                  className="flex min-h-11 w-full items-center text-base font-medium"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
