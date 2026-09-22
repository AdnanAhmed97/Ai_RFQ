"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, RotateCcw } from "lucide-react";

/**
 * Drives the extraction queue, one document per call.
 *
 * Refreshing between calls means the screen advances as each document lands
 * rather than sitting still and then jumping. The loop stops on the first
 * failure so a broken run is visible rather than buried under the next eleven.
 */
export function ProcessControls({
  rfqId,
  queued,
  failed,
}: {
  rfqId: string;
  queued: number;
  failed: number;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  /**
   * Documents are independent, so they are read concurrently.
   *
   * Each request claims a different job — the queue uses SELECT ... FOR UPDATE
   * SKIP LOCKED, so two lanes never take the same document — and on a
   * serverless host the lanes land on separate instances, which is the whole
   * point. Four at a time: enough to turn fifteen minutes into two, below the
   * rate limit a personal key carries.
   */
  const LANES = 4;

  async function run() {
    setRunning(true);
    setError(null);
    setDone(0);

    let exhausted = false;
    let failure: string | null = null;

    async function lane() {
      while (!exhausted && !failure) {
        const response = await fetch(`/api/rfx/${rfqId}/process`, { method: "POST" });
        const body = (await response.json()) as {
          error?: string;
          done?: boolean;
          outcome?: string | null;
        };

        if (!response.ok) {
          failure = body.error ?? "Processing failed.";
          return;
        }
        // No job was waiting: the queue is drained, stop every lane.
        if (body.outcome === null) {
          exhausted = true;
          return;
        }

        setDone((n) => n + 1);
        router.refresh();
        if (body.done) exhausted = true;
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(LANES, queued) }, lane));
      if (failure) setError(failure);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  async function retry() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/rfx/${rfqId}/process?action=retry`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "Could not re-queue.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  if (queued === 0 && failed === 0 && !running) return null;

  const primary = queued > 0 || running;

  return (
    <div className="flex items-center gap-2.5">
      {error ? (
        <p className="text-conflict max-w-xs truncate text-micro" role="alert" title={error}>
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={primary ? run : retry}
        disabled={running}
        className={
          primary
            ? "inline-flex items-center gap-1.5 rounded-sm bg-signal px-2.5 py-1 text-xs font-medium text-gr-960 transition-colors hover:bg-signal/85 disabled:opacity-50"
            : "inline-flex items-center gap-1.5 rounded-sm border border-[var(--rule-strong)] px-2.5 py-1 text-xs transition-colors hover:border-gr-700 disabled:opacity-50"
        }
      >
        {running ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : primary ? (
          <Play className="size-3" aria-hidden />
        ) : (
          <RotateCcw className="size-3" aria-hidden />
        )}
        {running
          ? `Reading · ${done}/${queued}`
          : primary
            ? `Process ${queued}`
            : `Re-queue ${failed} failed`}
      </button>
    </div>
  );
}
