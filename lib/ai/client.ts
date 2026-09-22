import "server-only";
import { env } from "@/lib/config/env";
import { AnthropicProvider } from "./anthropic";
import { AICredentialsMissingError, type AIProvider } from "./provider";
import { getSessionKey } from "./key-store";

/**
 * Resolves the AI provider for the current session.
 *
 * Providers are constructed per request rather than cached, because the
 * credential is session-scoped. This is the single place the concrete
 * Anthropic implementation is named; everything else depends on AIProvider.
 */
export function getProviderForSession(
  sessionId: string | null,
  operation = "unknown",
): AIProvider {
  const apiKey = getSessionKey(sessionId);
  if (!apiKey) throw new AICredentialsMissingError(operation);
  return new AnthropicProvider(apiKey, env.ANTHROPIC_MODEL);
}

/** Builds a provider from an explicit key, for the "Test connection" flow. */
export function getProviderForKey(apiKey: string): AIProvider {
  return new AnthropicProvider(apiKey, env.ANTHROPIC_MODEL);
}
