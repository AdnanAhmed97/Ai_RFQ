"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2 } from "lucide-react";

/**
 * Builds the comparable layer.
 *
 * Normalization is deterministic and needs no model; the eligibility review
 * does, because judging whether a conditional answer meets a requirement is a
 * reading of language. The button says which is which rather than presenting
 * one opaque "analyse".
 */
export function AnalyseControls({ rfqId, hasTruth }: { rfqId: string; hasTruth: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch(`/api/rfx/${rfqId}/analyse`, { method: "POST" });
      const body = (await response.json()) as {
        error?: string;
        truth?: { written: number; blocked: number };
      };

      if (!response.ok) {
        // A 401 still normalized; only the eligibility review needs a key.
        setError(body.error ?? "Could not build the comparison.");
        if (body.truth) {
          setNote(`${body.truth.written} quotes normalized without it.`);
        }
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      {error ? (
        <p className="text-conflict max-w-sm truncate text-micro" role="alert" title={error}>
          {error}
          {note ? ` ${note}` : ""}
        </p>
      ) : null}
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="inline-flex items-center gap-1.5 rounded-sm bg-signal px-2.5 py-1 text-xs font-medium text-gr-960 transition-colors hover:bg-signal/85 disabled:opacity-50"
      >
        {running ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <Calculator className="size-3" aria-hidden />
        )}
        {running ? "Building" : hasTruth ? "Rebuild comparison" : "Build comparison"}
      </button>
    </div>
  );
}
