import { env } from "@/lib/config/env";
import { getSessionId } from "@/lib/session/session";
import { getConnectionStatus } from "@/lib/ai/key-store";
import { Rail } from "@/components/shell/rail";
import { ContextBar } from "@/components/shell/context-bar";

/** Frame for the surfaces that sit outside a single RFx. */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const sessionId = await getSessionId();
  const connection = getConnectionStatus(sessionId);

  return (
    <div className="min-h-dvh">
      <Rail context={null} />
      <div className="flex min-h-dvh flex-col pl-[var(--rail-w)]">
        <ContextBar
          title="Workspace"
          aiConnected={connection.connected}
          model={env.ANTHROPIC_MODEL}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
