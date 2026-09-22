import { cn } from "@/lib/utils";

/**
 * A single row of figures, hairline-separated.
 *
 * Deliberately not a row of cards: the hero-metric card template fragments
 * numbers that belong to one reading, and a buyer scanning five figures should
 * cross them in one movement.
 */
export interface Metric {
  label: string;
  value: string;
  /** Rendered under the value when the figure needs a caveat. */
  note?: string;
  tone?: "default" | "verified" | "review" | "conflict" | "muted";
}

const TONE: Record<NonNullable<Metric["tone"]>, string> = {
  default: "text-gr-100",
  verified: "text-verified",
  review: "text-review",
  conflict: "text-conflict",
  muted: "ink-3",
};

export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="rule-b flex overflow-x-auto">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rule-r min-w-[8.5rem] flex-1 px-5 py-3.5 last:border-r-0"
        >
          <dt className="label">{metric.label}</dt>
          <dd className={cn("num mt-1.5 text-lg leading-none", TONE[metric.tone ?? "default"])}>
            {metric.value}
          </dd>
          {metric.note ? (
            <dd className="ink-3 mt-1.5 text-micro leading-none">{metric.note}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
