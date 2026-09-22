import { redirect } from "next/navigation";
import { getConnectionStatus } from "@/lib/ai/key-store";

export default async function Home() {
  const { connected } = await getConnectionStatus();
  redirect(connected ? "/workspace" : "/login");
}
