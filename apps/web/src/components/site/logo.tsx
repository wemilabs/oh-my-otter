import Link from "next/link";

export function LogoMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect width="24" height="24" rx="7" fill="currentColor" />
      <path
        d="M5 14.5c1.6-1.6 3.1-1.6 4.7 0s3.1 1.6 4.6 0 3.1-1.6 4.7 0"
        fill="none"
        stroke="var(--background)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="9" cy="9" r="1.3" fill="var(--background)" />
      <circle cx="15" cy="9" r="1.3" fill="var(--background)" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
    >
      <LogoMark />
      Oh My Otter
    </Link>
  );
}
