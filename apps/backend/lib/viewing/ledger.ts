/**
 * Pure viewing arithmetic. The film is divided into fixed content blocks; a wallet pays once per block
 * however often it replays, so pausing, buffering, rewinding and playback speed cannot add charges.
 *
 *   watched    finalized usage, the only state that reaches Arc
 *   reserved   delivered and funded, awaiting a playback report
 *   unreported delivered, then released without a report; free up to GRACE_BLOCKS
 *
 * Reported usage is limited to delivered blocks, so a client can only lie in its own disfavor. Silence
 * is the remaining abuse, and GRACE_BLOCKS bounds it: beyond that, delivered blocks are charged anyway.
 */
export type Range = [number, number];

export const BLOCK_SECONDS = 5;
/** Delivery ceiling ahead of reported playback; the player buffers about half of this. */
export const MAX_RESERVED_BLOCKS = 12;
export const GRACE_BLOCKS = 60;

export type Ledger = {
  totalBlocks: number;
  price: bigint;
  /** Everything this wallet has put at risk: Arc balance plus Arc charges. */
  funded: bigint;
  watched: Range[];
  reserved: Range[];
  unreported: Range[];
};

const expand = (ranges: Range[]) => {
  const blocks = new Set<number>();
  for (const [start, end] of ranges) for (let block = start; block < end; block += 1) blocks.add(block);
  return blocks;
};

const compress = (blocks: Set<number>) => {
  const ranges: Range[] = [];
  for (const block of [...blocks].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last?.[1] === block) last[1] = block + 1;
    else ranges.push([block, block + 1]);
  }
  return ranges;
};

export const size = (ranges: Range[]) => expand(ranges).size;
const union = (a: Range[], b: Range[]) => compress(new Set([...expand(a), ...expand(b)]));
const subtract = (a: Range[], b: Range[]) => compress(expand(a).difference(expand(b)));
const intersect = (a: Range[], b: Range[]) => compress(expand(a).intersection(expand(b)));

export const totalBlocksFor = (durationSeconds: number) => Math.ceil(durationSeconds / BLOCK_SECONDS);

/** A started block counts as consumed; this rounding is disclosed to viewers. */
export function blocksForSeconds(start: number, end: number, totalBlocks: number): Range | null {
  const first = Math.max(0, Math.floor(start / BLOCK_SECONDS));
  const last = Math.min(totalBlocks, Math.ceil(end / BLOCK_SECONDS));
  return first < last ? [first, last] : null;
}

/** Cumulative pricing rounds up per total, not per block, so all blocks cost exactly the full price. */
const priceOf = (ledger: Ledger, blocks: number) =>
  (ledger.price * BigInt(blocks) + BigInt(ledger.totalBlocks) - 1n) / BigInt(ledger.totalBlocks);

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Finalized usage owed, never beyond what the wallet funded. */
export const finalCharge = (ledger: Ledger) => min(priceOf(ledger, size(ledger.watched)), ledger.funded);

export const heldCharge = (ledger: Ledger) => priceOf(ledger, size(union(ledger.watched, ledger.reserved)));

/** Unwatched blocks the current funding still covers. */
export function fundedBlocksLeft(ledger: Ledger) {
  const affordable = ledger.funded * BigInt(ledger.totalBlocks) / ledger.price;
  const held = size(union(ledger.watched, ledger.reserved));
  return Math.max(0, Math.min(ledger.totalBlocks, Number(affordable)) - held);
}

/** Moves reservations to the grace set and charges only what overflows it. */
export function release(ledger: Ledger, ranges = ledger.reserved): Ledger {
  const blocks = [...expand(union(ledger.unreported, ranges))].sort((a, b) => a - b);
  const overflow = blocks.slice(0, Math.max(0, blocks.length - GRACE_BLOCKS));
  return {
    ...ledger,
    reserved: subtract(ledger.reserved, ranges),
    unreported: compress(new Set(blocks.slice(overflow.length))),
    watched: union(ledger.watched, compress(new Set(overflow))),
  };
}

export type Reservation = { ok: true; ledger: Ledger; changed: boolean } | { ok: false; reason: "funds" | "ahead" };

/** Authorizes delivery of a block range; a seek abandons reservations far from the new position. */
export function reserve(ledger: Ledger, range: Range): Reservation {
  const wanted = subtract([range], union(ledger.watched, ledger.reserved));
  if (wanted.length === 0) return { ok: true, ledger, changed: false };
  const near: Range = [Math.max(0, range[0] - MAX_RESERVED_BLOCKS), range[1] + MAX_RESERVED_BLOCKS];
  const next = release(ledger, subtract(ledger.reserved, [near]));
  const reserved = union(next.reserved, wanted);
  if (size(reserved) > MAX_RESERVED_BLOCKS) return { ok: false, reason: "ahead" };
  const candidate = { ...next, reserved, unreported: subtract(next.unreported, wanted) };
  if (heldCharge(candidate) > candidate.funded) return { ok: false, reason: "funds" };
  return { ok: true, ledger: candidate, changed: true };
}

/** Finalizes reported playback, which also returns those blocks to the grace budget. */
export function report(ledger: Ledger, played: Range[]): Ledger {
  const confirmed = intersect(union([], played), union(ledger.reserved, ledger.unreported));
  return {
    ...ledger,
    watched: union(ledger.watched, confirmed),
    reserved: subtract(ledger.reserved, confirmed),
    unreported: subtract(ledger.unreported, confirmed),
  };
}
