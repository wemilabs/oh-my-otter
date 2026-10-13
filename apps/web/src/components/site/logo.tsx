import Link from "next/link";

export function LogoMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <g fill="currentColor">
        <ellipse cx="12" cy="13.4" rx="10.4" ry="6.9" />
        <circle cx="3.6" cy="9.4" r="1.9" />
        <circle cx="20.4" cy="9.4" r="1.9" />
      </g>
      <g fill="var(--background)">
        <circle cx="7.9" cy="11.6" r="1.5" />
        <circle cx="16.1" cy="11.6" r="1.5" />
        <path d="M9.6 14.6c0-1 1.1-1.5 2.4-1.5s2.4.5 2.4 1.5c0 1.1-1.3 2.2-2.4 2.2s-2.4-1.1-2.4-2.2z" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="flex min-h-11 min-w-11 items-center gap-2 text-[15px] font-semibold tracking-tight"
    >
      <LogoMark />
      <span className="hidden sm:inline">Oh My Otter</span>
      <span className="sr-only">Oh My Otter</span>
    </Link>
  );
}
