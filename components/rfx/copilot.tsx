"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2, Sparkle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The RFx creation copilot.
 *
 * It asks before it writes. What it has learned stays visible in the panel
 * beside the conversation, so the buyer can see what the draft will be built on
 * before committing — and correct it while correcting is still cheap.
 */
interface Turn {
  role: "user" | "assistant";
  content: string;
  chips?: string[];
  error?: boolean;
}

type CopilotContext = Record<string, string | number | null>;

const OPENER =
  "We need corrugated packaging for 12 plants across India. Around 30 SKUs. " +
  "We want quotes from five vendors.";

export function RFxCopilot() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [context, setContext] = useState<CopilotContext>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"turn" | "draft" | null>(null);
  const [ready, setReady] = useState(false);

  const history = turns
    .filter((t) => !t.error)
    .map((t) => ({ role: t.role, content: t.content }));

  async function send(message: string) {
    if (!message.trim() || busy) return;
    const next = [...turns, { role: "user" as const, content: message }];
    setTurns(next);
    setInput("");
    setBusy("turn");

    try {
      const response = await fetch("/api/rfx/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "turn",
          messages: [...history, { role: "user", content: message }],
          context,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        reply?: string;
        clarifications?: { question: string; suggestedAnswers: string[] }[];
        contextUpdates?: CopilotContext;
        readyToDraft?: boolean;
      };

      if (!response.ok) {
        setTurns((t) => [...t, { role: "assistant", content: body.error ?? "That did not work.", error: true }]);
        return;
      }

      const chips = body.clarifications?.flatMap((c) => c.suggestedAnswers ?? []) ?? [];
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: [
            body.reply,
            ...(body.clarifications ?? []).map((c, i) => `${i + 1}. ${c.question}`),
          ]
            .filter(Boolean)
            .join("\n\n"),
          chips: chips.slice(0, 8),
        },
      ]);

      if (body.contextUpdates) {
        setContext((current) => {
          const merged = { ...current };
          for (const [key, value] of Object.entries(body.contextUpdates!)) {
            if (value !== null && value !== undefined) merged[key] = value;
          }
          return merged;
        });
      }
      setReady(Boolean(body.readyToDraft));
    } catch {
      setTurns((t) => [...t, { role: "assistant", content: "Could not reach the server.", error: true }]);
    } finally {
      setBusy(null);
    }
  }

  async function draft() {
    setBusy("draft");
    try {
      const response = await fetch("/api/rfx/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "draft", messages: history, context }),
      });
      const body = (await response.json()) as { error?: string; rfqId?: string };
      if (!response.ok || !body.rfqId) {
        setTurns((t) => [...t, { role: "assistant", content: body.error ?? "Drafting failed.", error: true }]);
        return;
      }
      router.push(`/rfx/${body.rfqId}/draft`);
    } catch {
      setTurns((t) => [...t, { role: "assistant", content: "Could not reach the server.", error: true }]);
    } finally {
      setBusy(null);
    }
  }

  const knownEntries = Object.entries(context).filter(([, v]) => v !== null && v !== "");

  return (
    <div className="flex h-[calc(100dvh-var(--bar-h))]">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-2xl">
            {turns.length === 0 ? (
              <>
                <h1 className="text-sm font-medium">What are you buying?</h1>
                <p className="ink-3 mt-1.5 text-xs">
                  Tell me what you need in your own words. I&rsquo;ll ask about anything that would
                  change the RFx, then draft it.
                </p>
                <button
                  type="button"
                  onClick={() => send(OPENER)}
                  className="rule-t ink-2 hover:text-signal mt-5 w-full pt-3 text-left text-xs transition-colors"
                >
                  &ldquo;{OPENER}&rdquo;
                </button>
              </>
            ) : (
              <div className="space-y-5">
                {turns.map((turn, index) => (
                  <div key={index}>
                    {turn.role === "user" ? (
                      <p className="rule-l border-l pl-3 text-xs font-medium">{turn.content}</p>
                    ) : (
                      <>
                        <p
                          className={cn(
                            "whitespace-pre-wrap text-xs leading-relaxed",
                            turn.error ? "text-conflict" : "text-gr-200",
                          )}
                        >
                          {turn.content}
                        </p>
                        {turn.chips?.length ? (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {turn.chips.map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => send(chip)}
                                disabled={busy !== null}
                                className="border-subtle hover:border-signal hover:text-signal rounded-sm border px-2 py-0.5 text-micro transition-colors disabled:opacity-40"
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
                {busy ? (
                  <p className="ink-3 flex items-center gap-2 text-xs">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    {busy === "draft" ? "Drafting the RFx" : "Thinking"}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
          className="rule-t flex items-center gap-2 px-4 py-3"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={busy !== null}
            placeholder="Describe what you need, or answer above"
            className="border-subtle focus:border-signal flex-1 rounded-sm border bg-gr-960 px-3 py-1.5 text-xs outline-none transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy !== null || !input.trim()}
            aria-label="Send"
            className="rounded-sm bg-signal p-1.5 text-gr-960 transition-colors hover:bg-signal/85 disabled:opacity-40"
          >
            <ArrowUp className="size-3.5" aria-hidden />
          </button>
        </form>
      </section>

      <aside className="rule-l w-72 shrink-0 overflow-y-auto border-l">
        <p className="label rule-b px-4 py-2">What I know so far</p>
        {knownEntries.length === 0 ? (
          <p className="ink-3 px-4 py-3 text-xs">
            Nothing yet. Anything I infer rather than hear from you is recorded as an assumption on
            the draft.
          </p>
        ) : (
          <dl className="px-4 py-3">
            {knownEntries.map(([key, value]) => (
              <div key={key} className="py-1">
                <dt className="label">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                <dd className="mt-0.5 text-xs">{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}

        {turns.length > 0 ? (
          <div className="rule-t px-4 py-3">
            <button
              type="button"
              onClick={draft}
              disabled={busy !== null}
              className={cn(
                "inline-flex w-full items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                ready
                  ? "bg-signal text-gr-960 hover:bg-signal/85"
                  : "border-subtle hover:border-gr-700 border",
              )}
            >
              {busy === "draft" ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <Sparkle className="size-3" aria-hidden />
              )}
              Generate the RFx
            </button>
            {!ready ? (
              <p className="ink-3 mt-1.5 text-micro">
                I&rsquo;d still ask a question or two, but you can draft now and edit after.
              </p>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
