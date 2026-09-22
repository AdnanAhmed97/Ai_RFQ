"use client";

import { useRef, useState } from "react";
import { ArrowUp, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Decision Copilot conversation.
 *
 * Every answer carries the tools that produced it, listed underneath. That is
 * not debug output — it is the buyer's evidence that a figure came from a
 * calculation rather than from the model's head, and it is the difference
 * between this and a chat window.
 */
interface Turn {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; status: string }[];
  error?: boolean;
}

const SUGGESTED = [
  "What's the cheapest eligible single-supplier award?",
  "What's the cheapest split award?",
  "What could make this recommendation wrong?",
  "What happens if freight rises 5%?",
  "Which lines cannot be compared, and why?",
];

export function DecisionChat({ rfqId, ready }: { rfqId: string; ready: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string | undefined>(undefined);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setTurns((t) => [...t, { role: "user", content: question }]);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch(`/api/rfx/${rfqId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, sessionId: sessionRef.current }),
      });
      const body = (await response.json()) as {
        error?: string;
        answer?: string;
        sessionId?: string;
        toolCalls?: { name: string; status: string }[];
      };

      if (!response.ok) {
        setTurns((t) => [
          ...t,
          { role: "assistant", content: body.error ?? "That did not work.", error: true },
        ]);
        return;
      }

      sessionRef.current = body.sessionId;
      setTurns((t) => [
        ...t,
        { role: "assistant", content: body.answer ?? "", toolCalls: body.toolCalls },
      ]);
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", content: "Could not reach the server.", error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="mx-auto max-w-lg">
            <p className="ink-3 text-xs">
              Ask anything about the comparison. Every figure in an answer comes from a
              deterministic calculation over the extracted data — the model chooses which
              calculation to run and explains the result, it never does the arithmetic.
            </p>
            <ul className="mt-4 space-y-1.5">
              {SUGGESTED.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => ask(question)}
                    disabled={!ready || busy}
                    className="rule-b hover:text-signal w-full border-b-0 py-1.5 text-left text-xs transition-colors disabled:opacity-40"
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            {turns.map((turn, index) => (
              <div key={index}>
                {turn.role === "user" ? (
                  <p className="rule-l border-l pl-3 text-xs font-medium">{turn.content}</p>
                ) : (
                  <div>
                    <div
                      className={cn(
                        "whitespace-pre-wrap text-xs leading-relaxed",
                        turn.error ? "text-conflict" : "text-gr-200",
                      )}
                    >
                      {turn.content}
                    </div>
                    {turn.toolCalls?.length ? (
                      <ul className="rule-t mt-3 flex flex-wrap gap-x-3 gap-y-1 pt-2">
                        {turn.toolCalls.map((call, i) => (
                          <li
                            key={i}
                            className={cn(
                              "flex items-center gap-1 text-micro",
                              call.status === "OK" ? "ink-3" : "text-conflict",
                            )}
                          >
                            <Wrench className="size-2.5" aria-hidden />
                            <span className="num">{call.name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {busy ? (
              <p className="ink-3 flex items-center gap-2 text-xs">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Running calculations
              </p>
            ) : null}
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="rule-t flex items-center gap-2 px-4 py-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={!ready || busy}
          placeholder={ready ? "Ask about the comparison" : "Build the comparison first"}
          className="border-subtle focus:border-signal flex-1 rounded-sm border bg-gr-960 px-3 py-1.5 text-xs outline-none transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!ready || busy || !input.trim()}
          aria-label="Ask"
          className="rounded-sm bg-signal p-1.5 text-gr-960 transition-colors hover:bg-signal/85 disabled:opacity-40"
        >
          <ArrowUp className="size-3.5" aria-hidden />
        </button>
      </form>
    </div>
  );
}
