import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, lt, or, isNull, sql } from "drizzle-orm";
import { pad, type Address, type Hex } from "viem";
import type { ViewingReceipt, ViewingReceiptGrant } from "@cinevest/abi";
import { createDatabase } from "@/lib/db";
import { viewingAccounts } from "@/lib/db/schema";
import { logEvent } from "@/lib/log";
import { readCampaignMedia } from "@/lib/media/arc";
import { playableUpload } from "@/lib/media/release";
import { readViewingChain, signViewingReceipt, submitViewingReceipt, type ViewingChain } from "./arc";
import {
  BLOCK_SECONDS, blocksForSeconds, finalCharge, fundedBlocksLeft, heldCharge, release, report, reserve, size,
  totalBlocksFor, type Ledger,
} from "./ledger";

/** Covers throttled background-tab timers; ending a session never depends on the browser saying so. */
const LEASE_MS = 90_000;
const CHAIN_REFRESH_MS = 30_000;
/** A viewer out of funds is waiting on a top-up, so it should land quickly. */
const EMPTY_CHAIN_REFRESH_MS = 5_000;
const FINAL_RECEIPT_MS = 5 * 60_000;
const SETTLEMENT_RECEIPT_MS = 10 * 60_000;
/** Below this, an active session keeps accruing rather than spend gas on a settlement. */
const SETTLE_THRESHOLD = 1_000_000n;
const MAX_WRITE_ATTEMPTS = 5;

type Row = typeof viewingAccounts.$inferSelect;
type Db = ReturnType<typeof createDatabase>;
export type ViewingKey = { arcChainId: string; campaign: Address; wallet: Address };
/** Wall-clock playback report from the player's `played` ranges, in seconds of content. */
export type PlayReport = { positionSeconds: number; played: [number, number][] };

/** Expected denial carrying the HTTP status and a stable code the player branches on. */
export class ViewingDenied extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

const identity = (key: ViewingKey) => and(
  eq(viewingAccounts.arcChainId, key.arcChainId),
  eq(viewingAccounts.campaignAddress, key.campaign),
  eq(viewingAccounts.wallet, key.wallet),
);

const load = async (db: Db, key: ViewingKey) => (await db.select().from(viewingAccounts).where(identity(key)).limit(1))[0];

const ledgerOf = (row: Row, chain?: ViewingChain): Ledger => ({
  totalBlocks: row.totalBlocks,
  price: BigInt(row.price),
  funded: chain ? chain.balance + chain.charged : BigInt(row.onchainBalance) + BigInt(row.onchainCharged),
  watched: row.watched,
  reserved: row.reserved,
  unreported: row.unreported,
});

const ledgerPatch = (ledger: Ledger) => ({
  watched: ledger.watched, reserved: ledger.reserved, unreported: ledger.unreported,
  chargedUnits: finalCharge(ledger).toString(),
});

const chainPatch = (chain: ViewingChain) => ({
  onchainBalance: chain.balance.toString(), onchainCharged: chain.charged.toString(),
  onchainSequence: chain.sequence, exitAt: chain.exitAt, chainReadAt: new Date(),
});

const endSession = { sessionId: null, leaseUntil: null };

/** Compare-and-set write: Neon's HTTP driver has no interactive transactions, and segments race heartbeats. */
async function mutate(db: Db, key: ViewingKey, change: (row: Row) => Partial<Row> | null) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const row = await load(db, key);
    if (!row) throw new ViewingDenied(409, "session_expired");
    const patch = change(row);
    if (!patch) return row;
    const [updated] = await db.update(viewingAccounts)
      .set({ ...patch, revision: row.revision + 1, updatedAt: new Date() })
      .where(and(identity(key), eq(viewingAccounts.revision, row.revision)))
      .returning();
    if (updated) return updated;
  }
  throw new ViewingDenied(503, "ledger_busy");
}

/** A live closing receipt could refund escrow immediately, so nothing new may be delivered behind it. */
const finalOutstanding = (row: Row, sequence: number) =>
  !!row.finalUntil && row.finalUntil > new Date() && (row.finalSequence ?? 0) > sequence;

export function accountView(row: Row) {
  const ledger = ledgerOf(row);
  return {
    positionSeconds: row.positionSeconds,
    watchedSeconds: size(row.watched) * BLOCK_SECONDS,
    fundedSeconds: fundedBlocksLeft(ledger) * BLOCK_SECONDS,
    charged: row.chargedUnits,
    reserved: (heldCharge(ledger) - finalCharge(ledger)).toString(),
    settled: row.onchainCharged,
    exitAt: row.exitAt?.toISOString() ?? null,
    active: !!row.sessionId && !!row.leaseUntil && row.leaseUntil > new Date(),
  };
}

export const readAccount = (key: ViewingKey) => load(createDatabase(), key);

/** Creates the ledger row from Arc-verified release facts; pricing inputs stay pinned to it afterwards. */
async function pinAccount(db: Db, key: ViewingKey, media: NonNullable<Awaited<ReturnType<typeof readCampaignMedia>>>) {
  const upload = await playableUpload(key.arcChainId, key.campaign, media.onchainHash);
  if (!upload?.playbackId || !upload.durationSeconds) throw new ViewingDenied(409, "source_unavailable");
  await db.insert(viewingAccounts).values({
    arcChainId: key.arcChainId, campaignAddress: key.campaign, wallet: key.wallet,
    playbackId: upload.playbackId, filmHash: media.onchainHash, price: media.watchPrice.toString(),
    totalBlocks: totalBlocksFor(upload.durationSeconds),
  }).onConflictDoNothing();
}

/**
 * Opens the single metered session for this wallet and film. A second tab or device takes over: the
 * earlier session's reservations are released, and its next request is refused.
 */
export async function startSession(key: ViewingKey) {
  const media = await readCampaignMedia(key.campaign, key.wallet);
  if (!media?.released) throw new ViewingDenied(404, "not_released");
  if (media.paid) return { fullAccess: true as const };
  const chain = await readViewingChain(key.campaign, key.wallet);
  if (!chain.metered) throw new ViewingDenied(409, "metering_unavailable");
  if (chain.exitAt) throw new ViewingDenied(409, "exit_pending");
  const db = createDatabase();
  await pinAccount(db, key, media);
  const sessionId = randomUUID();
  const row = await mutate(db, key, (current) => {
    if (finalOutstanding(current, chain.sequence)) throw new ViewingDenied(409, "closing");
    const ledger = release(ledgerOf(current, chain));
    if (ledger.funded === 0n && ledger.watched.length === 0) throw new ViewingDenied(402, "deposit_required");
    return { ...ledgerPatch(ledger), ...chainPatch(chain), sessionId, leaseUntil: new Date(Date.now() + LEASE_MS) };
  });
  return { sessionId, account: accountView(row) };
}

const toRanges = (played: PlayReport["played"], totalBlocks: number) =>
  played.map(([start, end]) => blocksForSeconds(start, end, totalBlocks)).filter((range) => range !== null);

/** Records playback and renews the lease; Arc is re-read periodically so exits and deposits take effect. */
export async function heartbeat(key: ViewingKey, sessionId: string, play: PlayReport) {
  const db = createDatabase();
  const before = await load(db, key);
  const refreshMs = before && fundedBlocksLeft(ledgerOf(before)) === 0 ? EMPTY_CHAIN_REFRESH_MS : CHAIN_REFRESH_MS;
  const stale = !before || Date.now() - before.chainReadAt.getTime() > refreshMs;
  const chain = stale ? await readViewingChain(key.campaign, key.wallet) : undefined;
  const row = await mutate(db, key, (current) => {
    if (current.sessionId !== sessionId) {
      throw new ViewingDenied(409, current.sessionId ? "session_replaced" : "session_expired");
    }
    const ledger = report(ledgerOf(current, chain), toRanges(play.played, current.totalBlocks));
    const positionSeconds = Math.floor(play.positionSeconds);
    const ended = !current.leaseUntil || current.leaseUntil <= new Date() || !!chain?.exitAt || !!chain?.fullAccess;
    if (ended) return { ...ledgerPatch(release(ledger)), ...(chain && chainPatch(chain)), ...endSession, positionSeconds };
    return { ...ledgerPatch(ledger), ...(chain && chainPatch(chain)), leaseUntil: new Date(Date.now() + LEASE_MS), positionSeconds };
  });
  if (chain?.fullAccess) throw new ViewingDenied(409, "full_access");
  if (chain?.exitAt) throw new ViewingDenied(409, "exit_pending");
  if (row.sessionId !== sessionId) throw new ViewingDenied(409, "session_expired");
  return accountView(row);
}

/** Authenticates a media request against the live session, reserving funds when it carries content. */
export async function authorizeDelivery(key: ViewingKey, sessionId: string, seconds?: { start: number; end: number }) {
  const row = await mutate(createDatabase(), key, (current) => {
    if (current.sessionId !== sessionId) throw new ViewingDenied(409, "session_replaced");
    if (!current.leaseUntil || current.leaseUntil <= new Date()) throw new ViewingDenied(409, "session_expired");
    const range = seconds && blocksForSeconds(seconds.start, seconds.end, current.totalBlocks);
    if (!range) return null;
    const outcome = reserve(ledgerOf(current), range);
    // 503 keeps hls.js retrying: 4xx is fatal to it and would discard buffered video the viewer already funded.
    if (!outcome.ok) throw new ViewingDenied(503, outcome.reason === "funds" ? "insufficient_balance" : "ahead_of_playback");
    return outcome.changed ? ledgerPatch(outcome.ledger) : null;
  });
  return row.playbackId;
}

const receiptFor = (row: Row, chain: ViewingChain, sequence: number, finalForWithdrawal: boolean, lifetimeMs: number): ViewingReceipt => {
  const funded = chain.balance + chain.charged;
  const price = BigInt(row.price);
  return {
    viewer: row.wallet as Address,
    campaign: row.campaignAddress as Address,
    filmHash: row.filmHash as Hex,
    sessionId: row.sessionId ? pad(`0x${row.sessionId.replaceAll("-", "")}`, { size: 32 }) : pad("0x0", { size: 32 }),
    sequence: BigInt(sequence),
    cumulativeCharge: BigInt(row.chargedUnits),
    spendCap: funded < price ? funded : price,
    finalForWithdrawal,
    deadline: BigInt(Math.floor((Date.now() + lifetimeMs) / 1000)),
  };
}

/**
 * Stops the session and issues the closing receipt the viewer submits to refund escrow at once. While that
 * receipt is live no new session opens, so usage cannot accumulate behind a refund already authorized.
 */
export async function closeSession(key: ViewingKey, sessionId: string | undefined, play: PlayReport): Promise<ViewingReceiptGrant> {
  const chain = await readViewingChain(key.campaign, key.wallet);
  if (chain.balance === 0n) throw new ViewingDenied(409, "nothing_to_refund");
  const db = createDatabase();
  // A wallet that deposited but never pressed play still needs a row to be refunded through.
  if (!(await load(db, key))) {
    const media = await readCampaignMedia(key.campaign);
    if (!media?.released) throw new ViewingDenied(404, "not_released");
    await pinAccount(db, key, media);
  }
  const finalUntil = new Date(Date.now() + FINAL_RECEIPT_MS);
  const row = await mutate(db, key, (current) => {
    const sessionMatches = !!sessionId && current.sessionId === sessionId;
    const ledger = release(sessionMatches ? report(ledgerOf(current, chain), toRanges(play.played, current.totalBlocks)) : ledgerOf(current, chain));
    const sequence = Math.max(current.sequence, chain.sequence) + 1;
    return {
      ...ledgerPatch(ledger), ...chainPatch(chain), ...endSession, sequence, finalSequence: sequence, finalUntil,
      ...(sessionMatches && { positionSeconds: Math.floor(play.positionSeconds) }),
    };
  });
  const receipt = receiptFor(row, chain, row.sequence, true, FINAL_RECEIPT_MS);
  const { sequence, cumulativeCharge, spendCap, deadline } = receipt;
  return {
    receipt: { ...receipt, sequence: sequence.toString(), cumulativeCharge: cumulativeCharge.toString(), spendCap: spendCap.toString(), deadline: deadline.toString() },
    signature: await signViewingReceipt(receipt),
  };
}

async function settleAccount(db: Db, row: Row) {
  const key = { arcChainId: row.arcChainId, campaign: row.campaignAddress as Address, wallet: row.wallet as Address };
  const chain = await readViewingChain(key.campaign, key.wallet);
  const active = !!row.sessionId && !!row.leaseUntil && row.leaseUntil > new Date();
  const unsettled = BigInt(row.chargedUnits) - chain.charged;
  const due = unsettled > 0n && chain.balance > 0n && (!active || !!chain.exitAt || unsettled >= SETTLE_THRESHOLD);
  const updated = await mutate(db, key, (current) => ({
    ...ledgerPatch(ledgerOf(current, chain)), ...chainPatch(chain),
    ...(due && { sequence: Math.max(current.sequence, chain.sequence) + 1 }),
  }));
  if (!due) return false;
  const receipt = receiptFor(updated, chain, updated.sequence, false, SETTLEMENT_RECEIPT_MS);
  await submitViewingReceipt(receipt, await signViewingReceipt(receipt));
  return true;
}

/**
 * Periodic worker pass. Cumulative receipts make it safe to crash or run concurrently: a duplicate reverts
 * on sequence or charges nothing. It must run well inside the contract's exit delay, or unsettled usage
 * is lost to the exiting viewer.
 */
export async function settleViewing(limit: number) {
  const db = createDatabase();
  const expired = await db.select().from(viewingAccounts)
    .where(and(isNotNull(viewingAccounts.sessionId), lt(viewingAccounts.leaseUntil, new Date()))).limit(limit);
  for (const row of expired) {
    const key = { arcChainId: row.arcChainId, campaign: row.campaignAddress as Address, wallet: row.wallet as Address };
    await mutate(db, key, (current) => (current.leaseUntil && current.leaseUntil < new Date()
      ? { ...ledgerPatch(release(ledgerOf(current))), ...endSession } : null));
  }
  const rows = await db.select().from(viewingAccounts).where(and(
    sql`${viewingAccounts.chargedUnits} > ${viewingAccounts.onchainCharged}`,
    or(isNull(viewingAccounts.finalUntil), lt(viewingAccounts.finalUntil, new Date())),
  )).orderBy(viewingAccounts.updatedAt).limit(limit);
  let settled = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (await settleAccount(db, row)) settled += 1;
    } catch (error) {
      failed += 1;
      logEvent("warn", "viewing.settle_failed", { campaign: row.campaignAddress, provider: "arc", error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { released: expired.length, scanned: rows.length, settled, failed };
}
