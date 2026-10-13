"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(command);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="group inline-flex min-h-11 items-center justify-center gap-3 rounded-md border border-border bg-card px-4 font-mono text-sm transition-colors hover:bg-accent sm:justify-start"
      aria-label={`Copy ${command}`}
    >
      <span className="text-muted-foreground">$</span>
      {command}
      {copied ? (
        <Check className="size-3.5 text-success" />
      ) : (
        <Copy className="size-3.5 text-muted-foreground group-hover:text-foreground" />
      )}
    </button>
  );
}
