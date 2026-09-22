import { AlertTriangle } from "lucide-react";

/**
 * A missing credential, stated exactly. Names the variable and where it goes —
 * an honest configuration state, never a blank screen.
 */
export function NotConfigured({
  title,
  detail,
  variables,
}: {
  title: string;
  detail: string;
  variables: string[];
}) {
  return (
    <div className="panel rule-b max-w-xl rounded-sm border p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-px size-3.5 shrink-0 text-review" aria-hidden />
        <div>
          <h2 className="text-xs font-medium">{title}</h2>
          <p className="ink-3 mt-1 text-xs">{detail}</p>
          <p className="label mt-3">Set in .env.local</p>
          <ul className="mt-1 space-y-0.5">
            {variables.map((variable) => (
              <li key={variable} className="num text-micro text-gr-300">
                {variable}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
