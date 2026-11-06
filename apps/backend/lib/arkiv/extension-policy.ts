/** Ownership changes are unsupported: both the current Arkiv owner and Arc creator must sign. */
export function extensionPolicy(input: {
  actor: string; owner: string; creator: string; currentBlock: bigint; expiresAt: bigint; targetBlock: bigint;
}): "ready" | "confirmed" | "forbidden" | "expired" | "invalid-target" {
  if (input.actor.toLowerCase() !== input.owner.toLowerCase() || input.actor.toLowerCase() !== input.creator.toLowerCase()) return "forbidden";
  if (input.expiresAt <= input.currentBlock) return "expired";
  if (input.targetBlock <= input.expiresAt) return "confirmed";
  // Rabdi uses approximately two seconds per block. Bound each request to a 30-day horizon.
  if (input.targetBlock > input.currentBlock + 30n * 43_200n) return "invalid-target";
  return "ready";
}
