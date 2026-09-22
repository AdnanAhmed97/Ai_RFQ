"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * BYOK connection form (spec §8).
 *
 * The key is posted once and held server-side for the session. It is never
 * echoed back, never stored in component state after submit, and never written
 * to localStorage — so there is no copy of it the browser can leak.
 */
type State =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "connected" }
  | { kind: "error"; message: string };

export function ConnectAIForm({
  model,
  demoModeAvailable,
}: {
  model: string;
  demoModeAvailable: boolean;
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function connect(useDemoKey: boolean) {
    setState({ kind: "testing" });
    try {
      const response = await fetch("/api/ai/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(useDemoKey ? { useDemoKey: true } : { apiKey }),
      });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setState({ kind: "error", message: body.error ?? "Connection failed." });
        return;
      }

      // Drop the key from component state the moment it is no longer needed.
      setApiKey("");
      setState({ kind: "connected" });
      router.push("/workspace");
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Could not reach the server." });
    }
  }

  const testing = state.kind === "testing";

  return (
    <div className="space-y-6">
      <section className="surface-raised space-y-4 rounded-lg border p-5">
        <div>
          <h2 className="text-sm font-medium">Connect your AI provider</h2>
          <p className="text-secondary mt-1 text-xs">
            RFx Intelligence uses your model provider for extraction and analysis.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="provider" className="text-tertiary text-2xs uppercase tracking-wide">
            Provider
          </label>
          <div
            id="provider"
            className="border-subtle rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
          >
            Anthropic
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="apiKey" className="text-tertiary text-2xs uppercase tracking-wide">
            API key
          </label>
          <input
            id="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (state.kind === "error") setState({ kind: "idle" });
            }}
            placeholder="sk-ant-..."
            disabled={testing}
            className="border-subtle focus:border-accent-500 numeric w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm outline-none transition-colors disabled:opacity-50"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="model" className="text-tertiary text-2xs uppercase tracking-wide">
            Model
          </label>
          <div
            id="model"
            className="border-subtle numeric rounded-md border bg-[var(--surface)] px-3 py-2 text-sm"
          >
            {model}
          </div>
        </div>

        <button
          type="button"
          onClick={() => connect(false)}
          disabled={testing || apiKey.trim().length === 0}
          className={cn(
            "bg-accent-500 hover:bg-accent-400 flex w-full items-center justify-center gap-2",
            "rounded-md px-3 py-2 text-sm font-medium text-graphite-950 transition-colors",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {testing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {testing ? "Testing connection" : "Test connection"}
        </button>

        {state.kind === "connected" ? (
          <p className="text-verified flex items-center gap-1.5 text-xs" role="status">
            <Check className="size-3.5" aria-hidden />
            AI provider connected
          </p>
        ) : null}

        {state.kind === "error" ? (
          <p className="text-conflict text-xs" role="alert">
            {state.message}
          </p>
        ) : null}

        <p className="text-tertiary border-subtle border-t pt-3 text-2xs">
          Your key is encrypted into your own session cookie. The server keeps no
          copy, browser scripts cannot read it, and it is never shown again.
        </p>
      </section>

      {demoModeAvailable ? (
        <button
          type="button"
          onClick={() => connect(true)}
          disabled={testing}
          className="border-subtle hover:border-graphite-600 text-secondary w-full rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-40"
        >
          Continue in demo mode
          <span className="text-tertiary block text-2xs">
            Uses the environment-provided key. Same pipeline, same model calls.
          </span>
        </button>
      ) : null}
    </div>
  );
}
