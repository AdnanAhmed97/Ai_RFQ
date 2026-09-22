import Link from "next/link";
import { Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Global header. Carries the AI connection state, because a buyer needs to know
 * at a glance whether what they are looking at was produced by a live model.
 */
export function TopBar({
  aiConnected,
  model,
}: {
  aiConnected: boolean;
  model: string;
}) {
  return (
    <header className="border-subtle sticky top-0 z-30 flex h-12 items-center justify-between border-b bg-[var(--surface)]/95 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <Link href="/workspace" className="text-sm font-medium tracking-tight">
          RFx Intelligence
        </Link>
        <span className="text-tertiary text-2xs hidden sm:inline">
          From messy vendor responses to defensible sourcing decisions
        </span>
      </div>

      <div className="flex items-center gap-3">
        {aiConnected ? (
          <Badge tone="verified">
            <span className="numeric normal-case">{model}</span>
          </Badge>
        ) : (
          <Badge tone="review">AI not connected</Badge>
        )}
        <Link
          href="/settings"
          className="text-secondary hover:text-graphite-100 rounded-sm p-1 transition-colors"
          aria-label="Settings"
        >
          <Settings className="size-4" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
