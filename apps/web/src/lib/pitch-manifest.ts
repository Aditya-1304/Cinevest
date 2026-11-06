/**
 * Browser copy of apps/backend/lib/swarm/pitch.ts (encodePitch) and the reference check in
 * artifact-validation.ts. The Arc campaign commits to the Swarm root of these exact bytes, so
 * trimming, lowercasing, key order and UTF-8 encoding must match the server byte for byte.
 */
import { ChunkSplitter } from "@ethersphere/core-sdk";

export const MAX_INDEXED_BYTES = 128;
export const MAX_SYNOPSIS = 16_384;
export const MAX_RIGHTS_NOTICE = 4_096;

export type PitchInput = {
  title: string;
  synopsis: string;
  posterRef: string;
  genre: string;
  creator: string;
  rightsNotice: string;
};

const byteLength = (value: string) => new TextEncoder().encode(value).length;

/** Trimmed, lowercased input exactly as the backend schema normalizes it; throws on invalid text. */
export function normalizePitch(input: PitchInput) {
  const title = input.title.trim();
  const genre = input.genre.trim();
  const synopsis = input.synopsis.trim();
  const rightsNotice = input.rightsNotice.trim();
  if (!title || byteLength(title) > MAX_INDEXED_BYTES) throw new Error("Title must be 1 to 128 bytes.");
  if (!genre || byteLength(genre) > MAX_INDEXED_BYTES) throw new Error("Genre must be 1 to 128 bytes.");
  if (!synopsis || synopsis.length > MAX_SYNOPSIS) throw new Error("Pitch text is required.");
  if (!rightsNotice || rightsNotice.length > MAX_RIGHTS_NOTICE) throw new Error("Rights notice is required.");
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(input.posterRef)) throw new Error("Invalid poster reference.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.creator)) throw new Error("Invalid creator address.");
  return {
    title,
    synopsis,
    posterRef: input.posterRef.replace(/^0x/i, "").toLowerCase(),
    genre,
    creator: input.creator.toLowerCase(),
    rightsNotice,
  };
}

export function encodePitch(input: PitchInput) {
  const pitch = normalizePitch(input);
  const manifest = {
    schema: "Cinevest.pitch.v1",
    title: pitch.title,
    synopsis: pitch.synopsis,
    posterRef: pitch.posterRef,
    genre: pitch.genre,
    creator: pitch.creator,
    rightsNotice: pitch.rightsNotice,
    manifestVersion: 1,
  };
  return { bytes: new TextEncoder().encode(JSON.stringify(manifest)), input: pitch };
}

/** Swarm root hash of the pitch bytes, as the 0x-prefixed value stored in Arc terms. */
export async function pitchReference(bytes: Uint8Array) {
  const root = await ChunkSplitter.root(bytes);
  return `0x${root.hash().toHex().replace(/^0x/i, "").toLowerCase()}` as `0x${string}`;
}
