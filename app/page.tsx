import { redirect } from "next/navigation";
import { getSessionId } from "@/lib/session/session";
import { getConnectionStatus } from "@/lib/ai/key-store";

export default async function Home() {
  const sessionId = await getSessionId();
  const { connected } = getConnectionStatus(sessionId);
  redirect(connected ? "/workspace" : "/login");
}
