import { z } from "zod";

const milestoneSchema = z
  .object({
    campaignAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    milestoneIndex: z.union([z.literal(1), z.literal(2)]),
    evidenceFiles: z.array(z.string().regex(/^[0-9a-fA-F]{64}$/)).min(1),
    submittedAt: z.number().int().positive().safe(),
    text: z.string().trim().min(1),
  })
  .strict();

export function encodeMilestone(input: unknown) {
  const milestone = milestoneSchema.parse(input);
  return Buffer.from(
    JSON.stringify({
      schema: "clipstake.milestone.v1",
      campaignAddress: milestone.campaignAddress.toLowerCase(),
      milestoneIndex: milestone.milestoneIndex,
      evidenceFiles: milestone.evidenceFiles.map((ref) => ref.toLowerCase()),
      submittedAt: milestone.submittedAt,
      text: milestone.text,
      manifestVersion: 1,
    }),
    "utf8",
  );
}
