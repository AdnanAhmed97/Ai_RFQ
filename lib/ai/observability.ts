import type { AIOperationStatus } from "@/types";
import type { AIUsage } from "./provider";

/**
 * AI operation logging (spec §54).
 *
 * Records what ran, how long it took, and what it cost. Deliberately records
 * NO prompt text, NO document contents, and NO credentials — those are the
 * three things the spec forbids logging, and the easiest to leak by accident.
 */
export interface AIOperationLogEntry {
  operation: string;
  model: string;
  status: AIOperationStatus;
  durationMs: number;
  usage?: AIUsage;
  toolNames?: string[];
  /** A short error label, never a provider message body. */
  error?: string;
  rfqId?: string;
}

type Sink = (entry: AIOperationLogEntry & { timestamp: string }) => void;

const consoleSink: Sink = (entry) => {
  const parts = [
    `[ai] ${entry.operation}`,
    entry.status,
    `${entry.durationMs}ms`,
    entry.usage ? `in=${entry.usage.inputTokens} out=${entry.usage.outputTokens}` : null,
    entry.usage?.cacheReadTokens ? `cache_read=${entry.usage.cacheReadTokens}` : null,
    entry.toolNames?.length ? `tools=${entry.toolNames.join(",")}` : null,
    entry.error ? `error=${entry.error}` : null,
  ].filter(Boolean);
  console.info(parts.join(" "));
};

let sink: Sink = consoleSink;

/** Swapped in Slice 7 to also persist into `ai_operation_log`. */
export function setAIOperationSink(next: Sink): void {
  sink = next;
}

export function logAIOperation(entry: AIOperationLogEntry): void {
  sink({ ...entry, timestamp: new Date().toISOString() });
}

const recent: (AIOperationLogEntry & { timestamp: string })[] = [];
const RECENT_LIMIT = 100;

/** Backs the developer debug panel. In-memory, most recent first. */
export function recordRecent(entry: AIOperationLogEntry & { timestamp: string }): void {
  recent.unshift(entry);
  if (recent.length > RECENT_LIMIT) recent.length = RECENT_LIMIT;
}

export function getRecentAIOperations(): readonly (AIOperationLogEntry & {
  timestamp: string;
})[] {
  return recent;
}

setAIOperationSink((entry) => {
  recordRecent(entry);
  consoleSink(entry);
});
