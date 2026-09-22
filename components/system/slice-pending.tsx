/**
 * A route whose behaviour belongs to a later slice.
 *
 * Scaffolding, not a mock. It renders no invented vendors, prices or KPIs —
 * a screen showing fabricated numbers before the pipeline exists is what the
 * specification forbids, and it also misrepresents progress.
 */
export function SlicePending({
  screen,
  slice,
  builds,
}: {
  screen: string;
  slice: string;
  builds: string[];
}) {
  return (
    <div className="px-4 py-8">
      <div className="max-w-lg">
        <p className="label">{slice}</p>
        <h2 className="mt-1.5 text-sm font-medium">{screen}</h2>
        <p className="ink-3 mt-1 text-xs">
          Route and frame are in place. Behaviour lands in {slice.toLowerCase()}.
        </p>
        <ul className="rule-t mt-4 pt-3">
          {builds.map((item) => (
            <li key={item} className="ink-3 flex gap-2.5 py-1 text-xs">
              <span aria-hidden className="text-gr-700">
                ·
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
