import { cn } from "@/lib/utils";
import type { ConfidenceState } from "@/types";

/**
 * The uncertainty vocabulary.
 *
 * Five states, each with its own hue, and no percentage anywhere — a number
 * here would imply a precision the system cannot defend. These are the only
 * saturated colours in the product, so an exception in a field of 150 cells is
 * findable before it is read.
 */
const PRESENTATION: Record<
  ConfidenceState,
  { label: string; className: string; meaning: string }
> = {
  VERIFIED: {
    label: "Verified",
    className: "state-verified",
    meaning: "Stated directly in the source and safely normalized.",
  },
  INFERRED: {
    label: "Inferred",
    className: "state-inferred",
    meaning: "A plausible reading the source does not state outright.",
  },
  REVIEW_REQUIRED: {
    label: "Needs review",
    className: "state-review",
    meaning: "Confirm this before it is used in an award.",
  },
  BLOCKED: {
    label: "Blocked",
    className: "state-blocked",
    meaning: "Not enough information to compare this value.",
  },
  CONFLICT: {
    label: "Conflict",
    className: "state-conflict",
    meaning: "Sources disagree. Nothing has been chosen for you.",
  },
};

export function ConfidenceBadge({
  state,
  className,
}: {
  state: ConfidenceState;
  className?: string;
}) {
  const presentation = PRESENTATION[state];
  return (
    <span
      className={cn("state", presentation.className, className)}
      title={presentation.meaning}
    >
      {presentation.label}
    </span>
  );
}

export function confidenceMeaning(state: ConfidenceState): string {
  return PRESENTATION[state].meaning;
}
