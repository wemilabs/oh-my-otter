import Link from "next/link";

export default function NotFound() {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-5 py-24 text-center sm:px-8 sm:py-32">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight">
          Page not found
        </h1>
        <p className="mt-3 text-muted-foreground">
          That page doesn&apos;t exist — maybe a typo, maybe an old link.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
        >
          Back to the homepage
        </Link>
      </div>
    </section>
  );
}
