import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "signal" | "verified" | "inferred" | "review" | "blocked" | "conflict";

const TONES: Record<Tone, string> = {
  neutral: "state-neutral",
  signal: "state-signal",
  verified: "state-verified",
  inferred: "state-inferred",
  review: "state-review",
  blocked: "state-blocked",
  conflict: "state-conflict",
};

/** A status marker: a 5px square and a tracked label. No pills, no fills. */
export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn("state", TONES[tone], className)} title={title}>
      {children}
    </span>
  );
}
