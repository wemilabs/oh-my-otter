"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { MOBILE_NAV_LINKS } from "./links";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="md:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="group -ml-1 inline-flex size-11 shrink-0 items-center justify-center"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(!open)}
      >
        <span className="inline-flex size-9 items-center justify-center rounded-md transition-colors group-hover:bg-accent">
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </span>
      </button>
      {open ? (
        <nav
          id="mobile-nav"
          className="absolute inset-x-0 top-full border-b border-border bg-background px-gutter-safe pb-4 shadow-sm"
        >
          <ul className="divide-y divide-border">
            {MOBILE_NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  prefetch={link.href === "/results"}
                  onClick={() => setOpen(false)}
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
