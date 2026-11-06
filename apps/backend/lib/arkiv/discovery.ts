/**
 * Bounded Arkiv discovery scanning. This module contains no provider client so the cursor,
 * mismatch and retry contracts can be exercised without network access.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGES = 10;
export const MAX_CANDIDATES = 200;

export type DiscoveryStatus = "complete" | "partial" | "unavailable";
export type Completeness = "exact" | "best-effort";

export type DiscoveryFilters = {
  genre?: string;
  deadline?: bigint;
  owner?: `0x${string}`;
};

type CursorPayload =
  | { v: 1; f: string; m: "key"; k: string }
  | { v: 1; f: string; m: "offset"; o: number; k?: string };

type SeenCampaigns = { seen?: string[] };

export type CursorState =
  | { mode: "key"; key: `0x${string}`; seen?: string[] }
  | { mode: "offset"; offset: number; key?: `0x${string}`; seen?: string[] };

type ScanState =
  | { mode: "key"; key?: `0x${string}`; seen?: string[] }
  | { mode: "offset"; offset: number; key?: `0x${string}`; seen?: string[] };

export type LoadPageRequest = {
  filters: DiscoveryFilters;
  afterKey?: `0x${string}`;
  offset: number;
  limit: number;
  onMismatch: "throw" | "skip";
};

export type LoadedPage = {
  rows: readonly unknown[];
  skipped: number;
  exhausted: boolean;
};

export type DiscoveryResult<T> = {
  items: T[];
  status: DiscoveryStatus;
  retryable: boolean;
  completeness: Completeness;
  nextCursor: string | null;
  excluded: number;
  scanned: number;
  pages: number;
};

export type RetryPolicy = { attempts: number; baseDelayMs: number };

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid discovery cursor");
    this.name = "InvalidCursorError";
  }
}

export function filtersFingerprint(filters: DiscoveryFilters) {
  return JSON.stringify([
    filters.genre ?? null,
    filters.deadline?.toString() ?? null,
    filters.owner?.toLowerCase() ?? null,
  ]);
}

export function encodeCursor(state: CursorState, filters: DiscoveryFilters) {
  const fingerprint = filtersFingerprint(filters);
  const payload: CursorPayload =
    state.mode === "key"
      ? {
          v: 1,
          f: fingerprint,
          m: "key",
          k: state.key.toLowerCase(),
        }
      : {
          v: 1,
          f: fingerprint,
          m: "offset",
          o: state.offset,
          ...(state.key ? { k: state.key.toLowerCase() } : {}),
        };
  return Buffer.from(JSON.stringify({ ...payload, seen: state.seen }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string, filters: DiscoveryFilters): CursorState {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError();
  }
  if (!payload || typeof payload !== "object") throw new InvalidCursorError();
  const value = payload as Partial<CursorPayload> & SeenCampaigns;
  if (value.v !== 1 || value.f !== filtersFingerprint(filters)) {
    throw new InvalidCursorError();
  }
  const seen = value.seen;
  if (
    seen !== undefined &&
    (!Array.isArray(seen) ||
      seen.length > 200 ||
      seen.some((item) => typeof item !== "string" || item.length > 80))
  ) {
    throw new InvalidCursorError();
  }
  if (value.m === "key") {
    if (typeof value.k !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value.k)) {
      throw new InvalidCursorError();
    }
    return {
      mode: "key",
      key: value.k as `0x${string}`,
      ...(seen ? { seen } : {}),
    };
  }
  if (
    value.m === "offset" &&
    typeof value.o === "number" &&
    Number.isSafeInteger(value.o) &&
    value.o >= 0 &&
    (value.k === undefined ||
      (typeof value.k === "string" && /^0x[0-9a-fA-F]{64}$/.test(value.k)))
  ) {
    return {
      mode: "offset",
      offset: value.o,
      ...(value.k ? { key: value.k.toLowerCase() as `0x${string}` } : {}),
      ...(seen ? { seen } : {}),
    };
  }
  throw new InvalidCursorError();
}

function errorText(error: unknown) {
  return error instanceof Error ? `${error.name} ${error.message}` : String(error);
}

/** Rate limits, timeouts and transient RPC failures can be retried without changing the cursor. */
function isRetryable(error: unknown) {
  return /429|rate.?limit|timeout|timed out|aborted|econnreset|etimedout|fetch failed|network|50[0-9]/i.test(
    errorText(error),
  );
}

function isMismatch(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "SchemaMismatchError" || /schema mismatch/i.test(error.message))
  );
}

async function loadWithRetry(
  request: LoadPageRequest,
  loadPage: (request: LoadPageRequest) => Promise<LoadedPage>,
  retry: RetryPolicy,
  sleep: (ms: number) => Promise<void>,
) {
  const attempts = Math.max(1, retry.attempts);
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await loadPage(request);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) throw error;
      await sleep(retry.baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function discoverFilms<T>({
  filters,
  cursor,
  limit = DEFAULT_PAGE_SIZE,
  maxPages = MAX_PAGES,
  maxCandidates = MAX_CANDIDATES,
  targetItems,
  retry = { attempts: 3, baseDelayMs: 250 },
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  loadPage,
  keyOf,
  verify,
  verifyBatch,
  identityOf,
}: {
  filters: DiscoveryFilters;
  cursor?: string;
  limit?: number;
  maxPages?: number;
  maxCandidates?: number;
  targetItems?: number;
  retry?: RetryPolicy;
  sleep?: (ms: number) => Promise<void>;
  loadPage: (request: LoadPageRequest) => Promise<LoadedPage>;
  keyOf: (row: unknown) => string | undefined;
  identityOf?: (item: T) => string | undefined;
  verify: (row: unknown) => Promise<T | null>;
  verifyBatch?: (rows: readonly unknown[]) => Promise<readonly (T | null)[]>;
}): Promise<DiscoveryResult<T>> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Invalid discovery page size");
  }
  const pageSize = Math.min(limit, MAX_PAGE_SIZE);
  const pageBudget = Math.min(MAX_PAGES, Math.max(1, Math.floor(maxPages)));
  const candidateBudget = Math.min(MAX_CANDIDATES, Math.max(1, Math.floor(maxCandidates)));
  if (targetItems !== undefined && (!Number.isInteger(targetItems) || targetItems < 1)) {
    throw new Error("Invalid discovery result target");
  }
  const incoming: ScanState = cursor
    ? decodeCursor(cursor, filters)
    : { mode: "key" };

  let state: ScanState = incoming;
  let lastKey = incoming.key;
  let offset = incoming.mode === "offset" ? incoming.offset : 0;
  let bestEffort = incoming.mode === "offset";
  let scanned = 0;
  let pages = 0;
  let excluded = 0;
  let exhausted = false;
  const items: T[] = [];
  const seen = new Set(incoming.seen ?? []);

  const finish = (
    status: DiscoveryStatus,
    retryable: boolean,
    next: CursorState | null,
  ): DiscoveryResult<T> => ({
    items,
    status,
    retryable,
    completeness: bestEffort ? "best-effort" : "exact",
    nextCursor: next ? encodeCursor({ ...next, seen: [...seen] }, filters) : null,
    excluded,
    scanned,
    pages,
  });

  const continuation = (): CursorState | null =>
    state.mode === "key"
      ? lastKey
        ? { mode: "key", key: lastKey, seen: [...seen] }
        : cursor
          ? { ...decodeCursor(cursor, filters), seen: [...seen] }
          : null
      : {
          mode: "offset",
          offset,
          ...(lastKey ? { key: lastKey } : {}),
          seen: [...seen],
        };

  while (pages < pageBudget && scanned < candidateBudget) {
    const remainingTarget = targetItems === undefined ? pageSize : targetItems - items.length;
    const take = Math.min(pageSize, remainingTarget, candidateBudget - scanned);
    const request: LoadPageRequest = {
      filters,
      afterKey: state.mode === "key" ? lastKey : undefined,
      offset: state.mode === "offset" ? offset : 0,
      limit: take,
      onMismatch: state.mode === "offset" ? "skip" : "throw",
    };

    let page: LoadedPage;
    try {
      page = await loadWithRetry(request, loadPage, retry, sleep);
    } catch (error) {
      if (state.mode === "key" && isMismatch(error)) {
        // A skipped page may contain no key to continue from. Continue with a bounded,
        // explicitly best-effort offset scan instead of failing the whole listing.
        state = { mode: "offset", offset: 0 };
        bestEffort = true;
        continue;
      }
      const retryable = isRetryable(error);
      return finish(
        items.length > 0 ? "partial" : "unavailable",
        retryable,
        continuation(),
      );
    }

    pages += 1;
    const rows = page.rows.slice(0, request.limit);
    const skipped = Math.max(0, page.skipped);
    const pageExhausted =
      page.exhausted && page.rows.length + page.skipped <= request.limit;
    if (skipped > 0) {
      bestEffort = true;
      excluded += skipped;
    }
    scanned += Math.min(skipped, Math.max(0, request.limit - rows.length));

    let verifiedRows: readonly (T | null)[];
    try {
      verifiedRows = verifyBatch
        ? await verifyBatch(rows)
        : await Promise.all(rows.map((row) => verify(row)));
      if (verifiedRows.length !== rows.length) throw new Error("Invalid verification batch result");
    } catch {
      return finish("partial", true, continuation());
    }

    let processedRows = 0;
    let targetReached = false;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      processedRows += 1;
      scanned += 1;
      const rowKey = keyOf(row);
      // A bounded offset fallback can re-read rows from before the key cursor. Never emit a key
      // the caller already received.
      if (
        state.mode === "offset" &&
        lastKey &&
        rowKey &&
        rowKey.toLowerCase() <= lastKey
      ) {
        continue;
      }
      const verified = verifiedRows[index] ?? null;
      if (verified === null) excluded += 1;
      else {
        const identity = identityOf?.(verified)?.toLowerCase().replace(/^0x/, "");
        if (identity && seen.has(identity)) {
          excluded += 1;
        } else {
          if (identity) seen.add(identity);
          items.push(verified);
        }
      }
      if (rowKey && /^0x[0-9a-fA-F]{64}$/.test(rowKey)) {
        lastKey = rowKey.toLowerCase() as `0x${string}`;
      }
      if (targetItems !== undefined && items.length >= targetItems) {
        targetReached = true;
        break;
      }
    }

    if (targetReached) {
      if (state.mode === "offset") {
        offset += Math.min(request.limit, rows.length + skipped);
      } else if (skipped > 0) {
        state = { mode: "offset", offset: 0 };
        bestEffort = true;
      }
      if (seen.size >= 200) return finish("partial", false, null);
      if (pageExhausted && processedRows === rows.length) {
        exhausted = true;
        break;
      }
      return finish("partial", false, continuation());
    }

    if (seen.size >= 200) {
      if (state.mode === "offset") offset += Math.min(request.limit, rows.length + skipped);
      return finish("partial", false, seen.size >= 200 ? null : continuation());
    }

    if (skipped > 0 && state.mode === "key") {
      // Restart by offset so malformed rows without usable keys cannot block progress.
      state = { mode: "offset", offset: 0 };
      bestEffort = true;
      continue;
    }

    if (pageExhausted) {
      exhausted = true;
      break;
    }
    if (rows.length === 0) {
      if (skipped > 0 && state.mode === "offset") {
        offset += skipped;
        continue;
      }
      exhausted = true;
      break;
    }
    if (state.mode === "offset") {
      offset += Math.min(request.limit, rows.length + skipped);
    }
  }

  if (!exhausted) {
    return finish("partial", false, continuation());
  }
  return finish(bestEffort ? "partial" : "complete", false, null);
}
