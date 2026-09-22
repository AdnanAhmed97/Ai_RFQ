"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { RailContext } from "@/lib/extraction/rail";

/**
 * The persistent left rail.
 *
 * Carries the five stages and a live vendor roster, so the buyer can move
 * between a comparison and one supplier's evidence without losing their place.
 * Position is marked by the accent and a 2px edge — the only place the accent
 * appears outside a primary action.
 */
const STAGES = [
  { segment: "draft", label: "Draft" },
  { segment: "responses", label: "Responses" },
  { segment: "truth", label: "Commercial Truth" },
  { segment: "decision", label: "Decision" },
  { segment: "brief", label: "Brief" },
] as const;

export function Rail({ context }: { context: RailContext | null }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workspace"
      className="rail fixed inset-y-0 left-0 z-30 flex w-[var(--rail-w)] flex-col"
    >
      <Link
        href="/workspace"
        className="rule-b flex h-[var(--bar-h)] shrink-0 items-center gap-2 px-3"
      >
        <span
          aria-hidden
          className="grid size-[18px] place-items-center rounded-xs bg-signal text-[10px] font-semibold text-gr-960"
        >
          R
        </span>
        <span className="text-xs font-medium tracking-tight">RFx Intelligence</span>
      </Link>

      <div className="flex-1 overflow-y-auto py-3">
        {context ? (
          <>
            <p className="label px-3 pb-1">Stage</p>
            <ul>
              {STAGES.map((stage) => {
                const href = `/rfx/${context.rfqId}/${stage.segment}`;
                const active = pathname === href;
                return (
                  <li key={stage.segment}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-8 items-center px-3 text-xs transition-colors",
                        active
                          ? "bg-gr-920 text-gr-100"
                          : "ink-2 hover:bg-gr-920 hover:text-gr-200",
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-0.5 bg-signal"
                        />
                      ) : null}
                      {stage.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <p className="label mt-6 px-3 pb-1">Suppliers</p>
            <ul>
              {context.vendors.map((vendor) => {
                const href = `/rfx/${context.rfqId}/vendor/${vendor.id}`;
                const active = pathname === href;
                return (
                  <li key={vendor.id}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-8 items-center gap-2 px-3 text-xs transition-colors",
                        active
                          ? "bg-gr-920 text-gr-100"
                          : "ink-2 hover:bg-gr-920 hover:text-gr-200",
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-0.5 bg-signal"
                        />
                      ) : null}
                      <span className="flex-1 truncate">{vendor.shortLabel}</span>
                      {vendor.blockers > 0 ? (
                        <span
                          aria-label={`${vendor.blockers} blocking issues`}
                          className="size-1 rounded-full bg-conflict"
                        />
                      ) : null}
                      <span className="num ink-3 shrink-0 text-micro">
                        {vendor.quoted === null ? "—" : vendor.quoted}
                        <span className="text-gr-600">/{vendor.expected ?? "?"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <p className="label px-3 pb-1.5">Workspace</p>
            <Link
              href="/workspace"
              className={cn(
                "relative flex h-8 items-center px-3 text-xs transition-colors",
                pathname === "/workspace"
                  ? "bg-gr-920 text-gr-100"
                  : "ink-2 hover:bg-gr-920 hover:text-gr-200",
              )}
            >
              {pathname === "/workspace" ? (
                <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-signal" />
              ) : null}
              Sourcing events
            </Link>
          </>
        )}
      </div>

      {context ? (
        <dl className="rule-t grid grid-cols-2 divide-x divide-[var(--rule)] text-center">
          <div className="px-2 py-2.5">
            <dt className="label">Issues</dt>
            <dd
              className={cn(
                "num mt-0.5 text-sm",
                context.openIssues > 0 ? "text-review" : "ink-3",
              )}
            >
              {context.openIssues}
            </dd>
          </div>
          <div className="px-2 py-2.5">
            <dt className="label">Queued</dt>
            <dd className="num ink-3 mt-0.5 text-sm">{context.queued}</dd>
          </div>
        </dl>
      ) : null}
    </nav>
  );
}
