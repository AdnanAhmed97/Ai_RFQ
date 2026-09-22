import { env } from "@/lib/config/env";
import { getSessionId } from "@/lib/session/session";
import { getConnectionStatus } from "@/lib/ai/key-store";
import { loadRailContext } from "@/lib/extraction/rail";
import { Rail } from "@/components/shell/rail";
import { ContextBar } from "@/components/shell/context-bar";

/**
 * The RFx instrument frame. The rail carries live supplier coverage, so the
 * buyer can see where the data stands from any screen.
 */
export default async function RFxLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [context, sessionId] = await Promise.all([loadRailContext(id), getSessionId()]);
  const connection = getConnectionStatus(sessionId);

  return (
    <div className="min-h-dvh">
      <Rail context={context} />
      <div className="flex min-h-dvh flex-col pl-[var(--rail-w)]">
        <ContextBar
          title={context?.title ?? "RFx"}
          status={context?.status}
          aiConnected={connection.connected}
          model={env.ANTHROPIC_MODEL}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
