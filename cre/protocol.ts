import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

/** Private request binds one simulator execution to the selected film and an exact Arc snapshot. */
export const reviewRequestSchema = z.object({
  requestId: z.uuid(), chainId: z.literal(5042002), campaign: address, factory: address,
  assetId: z.string().regex(/^[a-zA-Z0-9]{1,256}$/),
  playbackCommitment: hash, evidenceHash: hash,
  blockNumber: z.string().regex(/^\d{1,78}$/), blockHash: hash,
  issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().positive(),
}).strict();
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export const creChecksSchema = z.object({
  registered: z.boolean(), production: z.boolean(), evidenceMatches: z.boolean(),
  previousMilestoneApproved: z.boolean(), disputesClear: z.boolean(),
  approvalAllowed: z.boolean(), commitmentMatches: z.boolean(), providerReady: z.boolean(), signedOnly: z.boolean(),
}).strict();

/** This allowlist is the only simulator output the runner and backend may expose. */
export const reviewReportSchema = reviewRequestSchema.omit({ assetId: true }).extend({
  schema: z.literal("Cinevest.cre-release.v1"),
  execution: z.literal("cre-cli-simulation"),
  checks: creChecksSchema, ready: z.boolean(),
  approvalCalldata: z.string().regex(/^0x[0-9a-fA-F]+$/),
}).strict();
export type ReviewReport = z.infer<typeof reviewReportSchema>;
export const REPORT_MARKER = "CINEVEST_CRE_REPORT:";
