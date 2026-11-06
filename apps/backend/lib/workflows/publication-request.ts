/**
 * Canonical publication-journal request messages. The web app signs exactly this string with the
 * actor's wallet, so every write is bound to the wallet that owns the publication. This module
 * must stay dependency-free and byte-identical with apps/web/lib/publication.ts (checked by a
 * backend contract test).
 */
export const MESSAGE_MAX_AGE_SECONDS = 600;

export function stableStringify(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export type PublicationMessagePayload = Record<string, unknown>;

/** The exact string the actor signs; the server rebuilds it from the parsed request. */
export function publicationMessage(payload: PublicationMessagePayload): string {
  return stableStringify({
    app: "Reelance publication journal",
    ...payload,
  });
}

export function publicationIssuedAt(now = Date.now()) {
  return Math.floor(now / 1000);
}

export function publicationMessageIsRecent(
  issuedAt: unknown,
  now = Date.now(),
): boolean {
  return (
    typeof issuedAt === "number" &&
    Number.isSafeInteger(issuedAt) &&
    Math.abs(Math.floor(now / 1000) - issuedAt) <= MESSAGE_MAX_AGE_SECONDS
  );
}
