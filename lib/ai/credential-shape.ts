/**
 * Describes the SHAPE of a credential without revealing it.
 *
 * Diagnosing a rejected key otherwise means guessing between a truncated paste,
 * the wrong credential type, and a genuinely dead key — three problems with
 * three different fixes and one identical error message.
 *
 * Only non-secret facts are produced: the length, the published prefix, and
 * whether stray characters came along. No part of the secret is included.
 */
export interface CredentialShape {
  length: number;
  /** The published, non-secret prefix, e.g. "sk-ant-api03-". Empty if absent. */
  prefix: string;
  kind: "CONSOLE_API_KEY" | "OAUTH_TOKEN" | "UNRECOGNISED";
  hadSurroundingWhitespace: boolean;
  containsInnerWhitespace: boolean;
  /** Console keys are ~100-110 characters. Well under that means a partial paste. */
  looksTruncated: boolean;
}

const PREFIX = /^(sk-ant-(?:api|oat)\d*-)/;

export function describeCredential(raw: string): CredentialShape {
  const trimmed = raw.trim();
  const match = PREFIX.exec(trimmed);
  const prefix = match?.[1] ?? "";

  const kind = prefix.startsWith("sk-ant-oat")
    ? "OAUTH_TOKEN"
    : prefix.startsWith("sk-ant-api")
      ? "CONSOLE_API_KEY"
      : "UNRECOGNISED";

  return {
    length: trimmed.length,
    prefix,
    kind,
    hadSurroundingWhitespace: raw !== trimmed,
    containsInnerWhitespace: /\s/.test(trimmed),
    looksTruncated: kind !== "UNRECOGNISED" && trimmed.length < 90,
  };
}

/** A one-line, user-facing account of what was received. */
export function explainShape(shape: CredentialShape): string {
  const parts: string[] = [];

  if (shape.kind === "UNRECOGNISED") {
    parts.push(
      `the value does not start with sk-ant-api… or sk-ant-oat… (received ${shape.length} characters)`,
    );
  } else {
    parts.push(`received a ${shape.kind === "OAUTH_TOKEN" ? "OAuth token" : "Console API key"} of ${shape.length} characters`);
  }

  if (shape.looksTruncated) parts.push("which is shorter than a full key — the paste may be cut off");
  if (shape.containsInnerWhitespace) parts.push("and it contains a space or line break in the middle");
  else if (shape.hadSurroundingWhitespace) parts.push("(surrounding whitespace was trimmed)");

  return parts.join(", ");
}
