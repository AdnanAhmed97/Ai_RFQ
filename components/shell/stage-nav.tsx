"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Stage navigation for one RFx.
 *
 * The journey is linear — draft, responses, truth, decision, brief — and the
 * nav says so. Keeping it visible on every screen is what makes the product
 * read as one workflow rather than five tools sharing a header (spec §4).
 */
const STAGES = [
  { segment: "draft", label: "Draft" },
  { segment: "responses", label: "Responses" },
  { segment: "truth", label: "Commercial Truth" },
  { segment: "decision", label: "Decision" },
  { segment: "brief", label: "Brief" },
] as const;

export function StageNav({ rfqId }: { rfqId: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="RFx stages" className="border-subtle border-b px-4">
      <ul className="flex gap-1">
        {STAGES.map((stage) => {
          const href = `/rfx/${rfqId}/${stage.segment}`;
          const active = pathname === href;
          return (
            <li key={stage.segment}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-accent-500 text-graphite-100"
                    : "text-secondary hover:text-graphite-200 border-transparent",
                )}
              >
                {stage.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
