import { env, isDatabaseConfigured, isDemoModeAvailable } from "@/lib/config/env";
import { getSessionId } from "@/lib/session/session";
import { getConnectionStatus } from "@/lib/ai/key-store";
import { Badge } from "@/components/ui/badge";

/** Configuration state and the prototype's stated limits. */
export default async function SettingsPage() {
  const sessionId = await getSessionId();
  const status = getConnectionStatus(sessionId);

  const rows: { label: string; value: string; tone?: "verified" | "review" }[] = [
    {
      label: "AI provider",
      value: status.connected
        ? status.origin === "SESSION"
          ? "Connected — session key"
          : "Connected — environment key"
        : "Not connected",
      tone: status.connected ? "verified" : "review",
    },
    { label: "Model", value: env.ANTHROPIC_MODEL },
    {
      label: "Database",
      value: isDatabaseConfigured() ? "Configured" : "Not configured",
      tone: isDatabaseConfigured() ? "verified" : "review",
    },
    { label: "Demo mode", value: isDemoModeAvailable() ? "Available" : "Disabled" },
    { label: "FX rate", value: `1 USD = ₹${env.FX_USD_INR}` },
    { label: "Max upload", value: `${env.MAX_UPLOAD_MB} MB per document` },
  ];

  return (
    <>
      <p className="label rule-b px-4 py-2">Configuration</p>
      <table className="grid-table max-w-3xl">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="ink-3 w-44">{row.label}</td>
              <td>
                {row.tone ? (
                  <Badge tone={row.tone}>{row.value}</Badge>
                ) : (
                  <span className="num">{row.value}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="label rule-b rule-t px-4 py-2">Prototype boundaries</p>
      <ul className="max-w-3xl px-4 py-2.5">
        {[
          "The provider key is held in server memory for this session only. It is never persisted and never returned to the browser. A restart clears it.",
          "Vendor dispatch is simulated. No mail is sent.",
          "The USD rate is fixed so award arithmetic is reproducible, and is labelled wherever it affects a number.",
        ].map((line) => (
          <li key={line} className="ink-3 flex gap-2.5 py-1 text-xs">
            <span aria-hidden className="text-gr-700">
              ·
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
