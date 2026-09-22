import Link from "next/link";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The context bar: where the buyer is, and whether the model is live.
 *
 * The connection state sits here rather than buried in settings, because a
 * number produced by a disconnected system is a number nobody should act on.
 */
export function ContextBar({
  title,
  status,
  aiConnected,
  model,
  action,
}: {
  title: string;
  status?: string;
  aiConnected: boolean;
  model: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="bar sticky top-0 z-20 flex items-center gap-3 px-4">
      <h1 className="truncate text-sm font-medium tracking-tight">{title}</h1>
      {status ? (
        <span className="state state-signal shrink-0">
          {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {action}
        <span
          className={cn("state", aiConnected ? "state-verified" : "state-review")}
          title={aiConnected ? `Connected to ${model}` : "No model provider connected"}
        >
          <span className="num">{aiConnected ? model : "Not connected"}</span>
        </span>
        <Link
          href="/settings"
          aria-label="Settings"
          className="ink-3 hover:text-gr-200 -m-1 rounded-xs p-1 transition-colors"
        >
          <Settings className="size-3.5" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
