import { cn } from "@/lib/utils";

export function Window({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-[0_25px_50px_-12px_rgb(0_0_0/0.18)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 truncate font-mono text-xs text-muted-foreground">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

export type Status = "pass" | "fail" | "warn" | "na";

const STATUS_STYLES: Record<Status, string> = {
  pass: "bg-success-soft text-success",
  fail: "bg-danger-soft text-danger",
  warn: "bg-warning-soft text-warning",
  na: "bg-secondary text-muted-foreground",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex w-11 justify-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}
