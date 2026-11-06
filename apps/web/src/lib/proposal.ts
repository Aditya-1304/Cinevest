/**
 * Film proposal drafted in step 1 of /create (not yet published). Validation mirrors the backend
 * pitch and poster schemas so the creator sees a problem before signing anything.
 */
import { MAX_INDEXED_BYTES, MAX_RIGHTS_NOTICE, MAX_SYNOPSIS } from "@/lib/pitch-manifest";

export type ProposalDraft = {
  title: string;
  genre: string;
  synopsis: string;
  rightsNotice: string;
  poster: File | null;
};

export const DEFAULT_RIGHTS_NOTICE =
  "All proposal text and the poster are public. Backers receive capped revenue shares under the on-chain campaign terms and no ownership of the film.";

// Posters are part of a signed message, so keep them small for wallets.
export const MAX_POSTER_UI_BYTES = 1024 * 1024;
export const POSTER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const bytes = (value: string) => new TextEncoder().encode(value.trim()).length;

/** First problem that blocks publishing, or undefined when the proposal is ready. */
export function proposalIssue(proposal: ProposalDraft) {
  if (!proposal.title.trim() || bytes(proposal.title) > MAX_INDEXED_BYTES)
    return "Add a film title (up to 128 bytes) in the proposal step.";
  if (!proposal.genre.trim() || bytes(proposal.genre) > MAX_INDEXED_BYTES)
    return "Add a genre (up to 128 bytes) in the proposal step.";
  if (!proposal.synopsis.trim() || proposal.synopsis.trim().length > MAX_SYNOPSIS)
    return "Add a pitch in the proposal step.";
  if (!proposal.rightsNotice.trim() || proposal.rightsNotice.trim().length > MAX_RIGHTS_NOTICE)
    return "Add a rights notice in the proposal step.";
  if (!proposal.poster) return "Choose a poster image in the proposal step.";
  if (!POSTER_TYPES.includes(proposal.poster.type))
    return "The poster must be a JPEG, PNG, WebP or GIF image.";
  if (proposal.poster.size > MAX_POSTER_UI_BYTES)
    return "The poster must be 1 MiB or smaller.";
  return undefined;
}

export async function posterPayload(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < data.length; i += 0x8000)
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return { contentType: file.type, base64: btoa(binary) };
}
