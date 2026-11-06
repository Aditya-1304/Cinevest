import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeCursor,
  discoverFilms,
  encodeCursor,
  InvalidCursorError,
  MAX_PAGE_SIZE,
} from "./discovery.ts";

const key = (value) => `0x${value.toString(16).padStart(64, "0")}`;
const ownerA = `0x${"aa".repeat(20)}`;
const ownerB = `0x${"bb".repeat(20)}`;

function makeRows(count, owner = ownerA) {
  return Array.from({ length: count }, (_, index) => ({
    key: key(index + 1),
    owner,
  }));
}

function sortedRows(rows) {
  return [...rows].sort((left, right) => left.key.localeCompare(right.key));
}

function pageLoader(rows) {
  const state = { calls: [] };
  const loadPage = async (request) => {
    state.calls.push(request);
    const matching = sortedRows(
      rows.filter((row) => !request.filters.owner || row.owner === request.filters.owner),
    );
    if (request.afterKey) {
      while (matching.length && matching[0].key <= request.afterKey) matching.shift();
    }
    const page = matching.slice(
      request.offset,
      request.offset + request.limit,
    );
    return {
      rows: page,
      skipped: 0,
      exhausted: request.offset + page.length >= matching.length,
    };
  };
  return { loadPage, state };
}

const identity = (row) => Promise.resolve(row);

test("key cursors do not repeat emitted keys when records change between pages", async () => {
  const rows = makeRows(6);
  const { loadPage } = pageLoader(rows);
  const filters = {};
  const first = await discoverFilms({
    filters,
    limit: 2,
    maxPages: 1,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(first.items.map((row) => row.key), [key(1), key(2)]);
  assert.equal(first.status, "partial");
  assert.ok(first.nextCursor);

  // Insert before and after the cursor, and expire an already emitted row.
  rows.push({ key: key(0), owner: ownerA });
  rows.push({ key: key(7), owner: ownerA });
  rows.splice(
    rows.findIndex((row) => row.key === key(1)),
    1,
  );

  const second = await discoverFilms({
    filters,
    cursor: first.nextCursor,
    limit: 2,
    maxPages: 1,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(second.items.map((row) => row.key), [key(3), key(4)]);
  assert.ok(!second.items.some((row) => row.key <= key(2)));
});

test("page size and scan budget are bounded", async () => {
  const rows = makeRows(250);
  const { loadPage, state } = pageLoader(rows);
  const result = await discoverFilms({
    filters: {},
    limit: 10_000,
    maxPages: 2,
    maxCandidates: 150,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.equal(state.calls.length, 2);
  assert.ok(state.calls.every((call) => call.limit <= MAX_PAGE_SIZE));
  assert.equal(result.items.length, 150);
  assert.equal(result.status, "partial");
  assert.ok(result.nextCursor);
  assert.equal(result.scanned, 150);
});

test("campaign duplicates are suppressed while later candidates are scanned", async () => {
  const rows = [
    { key: key(1), campaign: "0xaaaa", title: "preferred" },
    { key: key(2), campaign: "0xaaaa", title: "duplicate" },
    { key: key(3), campaign: "0xbbbb", title: "later valid" },
    { key: key(4), campaign: "0xcccc", title: "next valid" },
  ];
  const { loadPage } = pageLoader(rows);
  const result = await discoverFilms({
    filters: {},
    limit: 2,
    targetItems: 2,
    maxPages: 2,
    loadPage,
    keyOf: (row) => row.key,
    identityOf: (row) => row.campaign,
    verify: async (row) => row,
  });
  assert.deepEqual(result.items.map((row) => row.title), ["preferred", "later valid"]);
  assert.equal(result.excluded, 1);
  assert.equal(result.scanned, 3);
  assert.ok(result.nextCursor);

  const next = await discoverFilms({
    filters: {},
    cursor: result.nextCursor,
    limit: 2,
    targetItems: 2,
    maxPages: 2,
    loadPage,
    keyOf: (row) => row.key,
    identityOf: (row) => row.campaign,
    verify: async (row) => row,
  });
  assert.deepEqual(next.items.map((row) => row.title), ["next valid"]);
});

test("offset fallback after a later mismatch does not repeat an emitted key", async () => {
  const rows = makeRows(6);
  let calls = 0;
  const loadPage = async (request) => {
    calls += 1;
    if (calls === 1) {
      return { rows: rows.slice(0, 2), skipped: 0, exhausted: false };
    }
    if (request.onMismatch === "throw") {
      const error = new Error("malformed entity");
      error.name = "SchemaMismatchError";
      throw error;
    }
    const page = rows.slice(request.offset, request.offset + 4);
    return {
      rows: page,
      skipped: 0,
      exhausted: request.offset + page.length >= rows.length,
    };
  };
  const first = await discoverFilms({
    filters: {},
    limit: 2,
    maxPages: 1,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(first.items.map((row) => row.key), [key(1), key(2)]);
  const second = await discoverFilms({
    filters: {},
    cursor: first.nextCursor,
    limit: 2,
    maxPages: 2,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(second.items.map((row) => row.key), [key(3), key(4)]);
  assert.ok(!second.items.some((row) => [key(1), key(2)].includes(row.key)));
});

test("offset continuations retain the emitted key while scanning from the beginning", async () => {
  const rows = makeRows(8);
  const loadPage = async (request) => {
    if (request.onMismatch === "throw" && request.afterKey === key(2)) {
      const error = new Error("malformed entity");
      error.name = "SchemaMismatchError";
      throw error;
    }
    const matching = sortedRows(rows);
    if (request.onMismatch === "throw") {
      const start = request.afterKey
        ? matching.findIndex((row) => row.key > request.afterKey)
        : 0;
      const page = matching.slice(start, start + request.limit);
      return {
        rows: page,
        skipped: 0,
        exhausted: start + page.length >= matching.length,
      };
    }
    const page = matching.slice(request.offset, request.offset + request.limit);
    return {
      rows: page,
      skipped: 0,
      exhausted: request.offset + page.length >= matching.length,
    };
  };
  const first = await discoverFilms({
    filters: {},
    limit: 2,
    maxPages: 1,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  const second = await discoverFilms({
    filters: {},
    cursor: first.nextCursor,
    limit: 2,
    maxPages: 2,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(second.items.map((row) => row.key), [key(3), key(4)]);
  const third = await discoverFilms({
    filters: {},
    cursor: second.nextCursor,
    limit: 2,
    maxPages: 1,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(third.items.map((row) => row.key), [key(5), key(6)]);
});

test("a schema mismatch falls back to a labeled best-effort offset scan", async () => {
  const rows = makeRows(4);
  let calls = 0;
  const loadPage = async (request) => {
    calls += 1;
    if (request.onMismatch === "throw") {
      const error = new Error("malformed entity");
      error.name = "SchemaMismatchError";
      throw error;
    }
    const page = rows.slice(request.offset, request.offset + 2);
    return {
      rows: page,
      skipped: request.offset === 0 ? 1 : 0,
      exhausted: request.offset + page.length >= rows.length,
    };
  };
  const result = await discoverFilms({
    filters: {},
    limit: 2,
    maxPages: 1,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "partial");
  assert.equal(result.completeness, "best-effort");
  assert.equal(result.items.length, 2);
  assert.ok(result.excluded >= 1);
});

test("a fully skipped key page continues from a bounded offset fallback", async () => {
  const rows = makeRows(3);
  const loadPage = async (request) => {
    if (request.onMismatch === "throw") {
      return { rows: [], skipped: 2, exhausted: false };
    }
    return { rows: rows.slice(0, 2), skipped: 0, exhausted: true };
  };
  const result = await discoverFilms({
    filters: {},
    limit: 2,
    maxPages: 3,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.equal(result.status, "partial");
  assert.equal(result.completeness, "best-effort");
  assert.deepEqual(result.items.map((row) => row.key), [key(1), key(2)]);
  assert.equal(result.nextCursor, null);
});

test("offset fallback advances through fully skipped malformed rows", async () => {
  const rows = makeRows(4);
  const loadPage = async (request) => {
    if (request.onMismatch === "throw") {
      const error = new Error("malformed entity");
      error.name = "SchemaMismatchError";
      throw error;
    }
    if (request.offset === 0) {
      return { rows: [], skipped: 2, exhausted: false };
    }
    const page = rows.slice(request.offset, request.offset + request.limit);
    return {
      rows: page,
      skipped: 0,
      exhausted: request.offset + page.length >= rows.length,
    };
  };
  const result = await discoverFilms({
    filters: {},
    limit: 2,
    maxPages: 3,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(result.items.map((row) => row.key), [key(3), key(4)]);
  assert.equal(result.completeness, "best-effort");
});

test("malformed rows count toward the candidate budget", async () => {
  const rows = makeRows(6);
  const result = await discoverFilms({
    filters: {},
    limit: 3,
    maxPages: 10,
    maxCandidates: 3,
    loadPage: async () => ({
      rows: rows.slice(0, 2),
      skipped: 1,
      exhausted: false,
    }),
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.equal(result.scanned, 3);
  assert.ok(result.scanned <= 3);
});

test("malformed entities are excluded without breaking pagination", async () => {
  const rows = makeRows(4);
  const { loadPage } = pageLoader(rows);
  const result = await discoverFilms({
    filters: {},
    limit: 2,
    maxPages: 3,
    loadPage,
    keyOf: (row) => row.key,
    verify: async (row) => (row.key === key(2) ? null : row),
  });
  assert.deepEqual(result.items.map((row) => row.key), [key(1), key(3), key(4)]);
  assert.equal(result.excluded, 1);
  assert.equal(result.status, "complete");
  assert.equal(result.nextCursor, null);
});

test("rate limits and timeouts return a retryable page without losing accepted results", async () => {
  const rows = makeRows(6);
  const { loadPage } = pageLoader(rows);
  const sleeps = [];
  let failing = true;
  const failingLoader = async (request) => {
    if (failing && request.afterKey) {
      const error = new Error("429 Too Many Requests");
      throw error;
    }
    return loadPage(request);
  };
  const first = await discoverFilms({
    filters: {},
    limit: 2,
    maxPages: 3,
    retry: { attempts: 3, baseDelayMs: 10 },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    loadPage: failingLoader,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(first.items.map((row) => row.key), [key(1), key(2)]);
  assert.equal(first.status, "partial");
  assert.equal(first.retryable, true);
  assert.ok(first.nextCursor);
  assert.deepEqual(sleeps, [10, 20]);

  failing = false;
  const second = await discoverFilms({
    filters: {},
    cursor: first.nextCursor,
    limit: 2,
    maxPages: 3,
    loadPage: failingLoader,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(second.items.map((row) => row.key), [key(3), key(4), key(5), key(6)]);
  assert.ok(!second.items.some((row) => row.key <= key(2)));
});

test("a persistent timeout on the first page is unavailable and retryable", async () => {
  const result = await discoverFilms({
    filters: {},
    limit: 2,
    retry: { attempts: 2, baseDelayMs: 1 },
    sleep: async () => {},
    loadPage: async () => {
      throw new Error("request timed out");
    },
    keyOf: () => undefined,
    verify: identity,
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.retryable, true);
  assert.equal(result.completeness, "exact");
  assert.equal(result.nextCursor, null);
});

test("public discovery spans owners while the dashboard filters by owner", async () => {
  const rows = [
    ...makeRows(2, ownerA),
    { key: key(3), owner: ownerB },
    { key: key(4), owner: ownerB },
  ];
  const { loadPage, state } = pageLoader(rows);
  const publicResult = await discoverFilms({
    filters: {},
    limit: 10,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.equal(publicResult.items.length, 4);
  assert.equal(state.calls[0].filters.owner, undefined);

  const dashboardA = await discoverFilms({
    filters: { owner: ownerA },
    limit: 10,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  const dashboardB = await discoverFilms({
    filters: { owner: ownerB },
    limit: 10,
    loadPage,
    keyOf: (row) => row.key,
    verify: identity,
  });
  assert.deepEqual(dashboardA.items.map((row) => row.owner), [ownerA, ownerA]);
  assert.deepEqual(dashboardB.items.map((row) => row.owner), [ownerB, ownerB]);
});

test("cursors are opaque, bounded and bound to their filters", () => {
  const cursor = encodeCursor({ mode: "key", key: key(9) }, { genre: "Drama" });
  assert.ok(cursor.length <= 2048);
  assert.deepEqual(decodeCursor(cursor, { genre: "Drama" }), {
    mode: "key",
    key: key(9),
  });
  assert.throws(() => decodeCursor(cursor, { genre: "Comedy" }), InvalidCursorError);
  assert.throws(() => decodeCursor("not-a-cursor", {}), InvalidCursorError);
  const offsetCursor = encodeCursor({ mode: "offset", offset: 20 }, {});
  assert.deepEqual(decodeCursor(offsetCursor, {}), { mode: "offset", offset: 20 });
  const markedOffset = encodeCursor(
    { mode: "offset", offset: 20, key: key(9) },
    {},
  );
  assert.deepEqual(decodeCursor(markedOffset, {}), {
    mode: "offset",
    offset: 20,
    key: key(9),
  });
});
