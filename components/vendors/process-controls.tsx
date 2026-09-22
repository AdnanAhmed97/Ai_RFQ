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

  async function run() {
    setRunning(true);
    setError(null);
    setDone(0);
    try {
      for (let i = 0; i < queued + 2; i++) {
        const response = await fetch(`/api/rfx/${rfqId}/process`, { method: "POST" });
        const body = (await response.json()) as { error?: string; done?: boolean };
        if (!response.ok) {
          setError(body.error ?? "Processing failed.");
          break;
        }
        setDone((n) => n + 1);
        router.refresh();
        if (body.done) break;
      }
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
          ? `Processing · ${done}`
          : primary
            ? `Process ${queued}`
            : `Re-queue ${failed} failed`}
      </button>
    </div>
  );
}
