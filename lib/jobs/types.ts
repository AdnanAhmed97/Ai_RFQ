/**
 * The extraction job model.
 *
 * Document processing is asynchronous by contract from the first slice. Nothing
 * in the UI or the domain waits on a request that does the work — a job is
 * enqueued, its state lives in the database, and the screen reads that state.
 *
 * The prototype runs jobs in-process. That is an implementation detail behind
 * this interface, and swapping it for a worker later touches only the runner.
 */

export const EXTRACTION_JOB_STATES = [
  "QUEUED",
  "PROCESSING",
  "EXTRACTING",
  "MATCHING",
  "VALIDATING",
  "COMPLETE",
  "NEEDS_REVIEW",
  "FAILED",
] as const;

export type ExtractionJobState = (typeof EXTRACTION_JOB_STATES)[number];

/** States from which no further transition occurs. */
export const TERMINAL_JOB_STATES: readonly ExtractionJobState[] = [
  "COMPLETE",
  "NEEDS_REVIEW",
  "FAILED",
];

export function isTerminal(state: ExtractionJobState): boolean {
  return TERMINAL_JOB_STATES.includes(state);
}

/**
 * Legal transitions.
 *
 * Enforced rather than documented, because a job that jumps from QUEUED to
 * COMPLETE without passing through the work is exactly the "fake progress"
 * the spec prohibits (Rule 9) — and it would be indistinguishable from a real
 * run in the database afterwards.
 */
export const ALLOWED_TRANSITIONS: Record<ExtractionJobState, readonly ExtractionJobState[]> = {
  QUEUED: ["PROCESSING", "FAILED"],
  PROCESSING: ["EXTRACTING", "FAILED"],
  EXTRACTING: ["MATCHING", "FAILED", "NEEDS_REVIEW"],
  MATCHING: ["VALIDATING", "FAILED", "NEEDS_REVIEW"],
  VALIDATING: ["COMPLETE", "NEEDS_REVIEW", "FAILED"],
  COMPLETE: [],
  NEEDS_REVIEW: [],
  // A failed job is retried by re-queueing it, which is an explicit act.
  FAILED: ["QUEUED"],
};

export function canTransition(from: ExtractionJobState, to: ExtractionJobState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Progress shown alongside each stage. Derived from real transitions only. */
export const STATE_PROGRESS: Record<ExtractionJobState, number> = {
  QUEUED: 0,
  PROCESSING: 10,
  EXTRACTING: 40,
  MATCHING: 70,
  VALIDATING: 90,
  COMPLETE: 100,
  NEEDS_REVIEW: 100,
  FAILED: 100,
};

/** Buyer-facing stage labels (spec §62). */
export const STATE_LABELS: Record<ExtractionJobState, string> = {
  QUEUED: "Queued",
  PROCESSING: "Reading",
  EXTRACTING: "Extracting",
  MATCHING: "Matching lines",
  VALIDATING: "Validating",
  COMPLETE: "Read",
  NEEDS_REVIEW: "Needs review",
  FAILED: "Failed",
};

export interface ExtractionJob {
  id: string;
  rfqId: string;
  vendorResponseId: string;
  documentId: string;
  state: ExtractionJobState;
  progress: number;
  attempt: number;
  maxAttempts: number;
  claimedAt?: string;
  claimedBy?: string;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  reviewReason?: string;
}

export interface ExtractionJobEvent {
  id: string;
  jobId: string;
  fromState: ExtractionJobState | null;
  toState: ExtractionJobState;
  note?: string;
  occurredAt: string;
}

export class InvalidJobTransitionError extends Error {
  constructor(
    readonly jobId: string,
    readonly from: ExtractionJobState,
    readonly to: ExtractionJobState,
  ) {
    super(`Job ${jobId} cannot move from ${from} to ${to}.`);
    this.name = "InvalidJobTransitionError";
  }
}
