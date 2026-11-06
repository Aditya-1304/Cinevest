
/**
 * Structured, redacted operational logging. Every line is one JSON object keyed by operation id and
 * canonical campaign so an injected failure can be traced without ever printing proofs, sessions,
 * signatures or API credentials.
 */
const SECRET_KEY = /secret|token|key|signature|proof|cookie|authorization|password|nullifier|jwt/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return typeof value === "string" && value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1)]),
  );
}

export type LogFields = {
  /** Journal operation id or request correlation id. */
  op?: string;
  campaign?: string;
  provider?: "arc" | "arkiv" | "swarm" | "mux" | "world" | "db";
  latencyMs?: number;
  retry?: number;
  block?: number | string;
  [extra: string]: unknown;
};

export function logEvent(level: "info" | "warn" | "error", event: string, fields: LogFields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(redact(fields) as object) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

/** Times a provider call and logs its latency and outcome (never its payload). */
export async function timed<T>(event: string, fields: LogFields, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    logEvent("info", event, { ...fields, latencyMs: Date.now() - started, ok: true });
    return result;
  } catch (error) {
    logEvent("warn", event, { ...fields, latencyMs: Date.now() - started, ok: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
