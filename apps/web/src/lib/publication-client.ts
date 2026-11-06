/**
 * Browser side of the backend publication journal (apps/backend/app/publications and
 * app/api/artifacts). Every write is signed by the creator's wallet over a canonical,
 * short-lived message; stableStringify/publicationMessage below must stay byte-identical to
 * apps/backend/lib/workflows/publication-request.ts, which the server uses to verify them.
 */
function stableStringify(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function publicationMessage(payload: Record<string, unknown>) {
  return stableStringify({ app: "Cinevest publication journal", ...payload });
}

export type SignMessage = (message: string) => Promise<`0x${string}`>;

export type JournalResponse<T = Record<string, unknown>> = {
  status: number;
  ok: boolean;
  data: T;
};

/** Signs `payload` (plus a fresh issuedAt) and POSTs it to a same-origin backend endpoint. */
export async function signedPost<T = Record<string, unknown>>(
  path: "/api/publications" | "/api/artifacts" | "/api/listings/extend",
  payload: Record<string, unknown>,
  sign: SignMessage | null,
): Promise<JournalResponse<T>> {
  const body = { ...payload, issuedAt: Math.floor(Date.now() / 1000) };
  // Without a signer the request is authorized by the SIWE session cookie instead.
  const signature = sign ? await sign(publicationMessage(body)) : undefined;
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(signature ? { ...body, signature } : body),
  });
  const data = (await response.json().catch(() => ({}))) as T;
  return { status: response.status, ok: response.ok, data };
}

/** Campaign terms in the backend's wire format: Solidity integers as decimal strings. */
export type WireTerms = {
  creator: string;
  reviewer: string;
  usdc: string;
  fundingGoal: string;
  fundingDeadline: string;
  productionDeadline: string;
  rightsDuration: string;
  watchPrice: string;
  funderBps: number;
  repaymentCapBps: number;
  pitchReference: string;
  worldGated: boolean;
  perHumanLimit: string;
};

export function toWireTerms(terms: {
  creator: string;
  reviewer: string;
  usdc: string;
  fundingGoal: bigint;
  fundingDeadline: bigint;
  productionDeadline: bigint;
  rightsDuration: bigint;
  watchPrice: bigint;
  funderBps: number;
  repaymentCapBps: number;
  pitchReference: string;
  worldGated: boolean;
  perHumanLimit: bigint;
}): WireTerms {
  return {
    ...terms,
    fundingGoal: terms.fundingGoal.toString(),
    fundingDeadline: terms.fundingDeadline.toString(),
    productionDeadline: terms.productionDeadline.toString(),
    rightsDuration: terms.rightsDuration.toString(),
    watchPrice: terms.watchPrice.toString(),
    perHumanLimit: terms.perHumanLimit.toString(),
  };
}

export function fromWireTerms(terms: WireTerms) {
  return {
    creator: terms.creator as `0x${string}`,
    reviewer: terms.reviewer as `0x${string}`,
    usdc: terms.usdc as `0x${string}`,
    fundingGoal: BigInt(terms.fundingGoal),
    fundingDeadline: BigInt(terms.fundingDeadline),
    productionDeadline: BigInt(terms.productionDeadline),
    rightsDuration: BigInt(terms.rightsDuration),
    watchPrice: BigInt(terms.watchPrice),
    funderBps: terms.funderBps,
    repaymentCapBps: terms.repaymentCapBps,
    pitchReference: terms.pitchReference as `0x${string}`,
    worldGated: terms.worldGated,
    perHumanLimit: BigInt(terms.perHumanLimit),
  };
}
