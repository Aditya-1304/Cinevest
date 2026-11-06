import { z } from "zod";
import { ARC_TESTNET_USDC } from "@cinevest/abi";
import type { CampaignTerms } from "@cinevest/abi";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(value => !/^0x0{40}$/.test(value));
const uint = (bits: number, positive = false) => z.string().regex(/^(0|[1-9][0-9]*)$/)
  .refine(value => /^\d+$/.test(value) && value.length <= 78 && BigInt(value) < 2n ** BigInt(bits) && (!positive || BigInt(value) > 0n));

/** Wire terms use decimal strings for Solidity integers wider than JavaScript's safe range. */
export const campaignTermsInput = z.object({
  creator: address,
  reviewer: address,
  usdc: z.string().refine(value => value.toLowerCase() === ARC_TESTNET_USDC.address.toLowerCase()),
  fundingGoal: uint(256, true),
  fundingDeadline: uint(64, true),
  productionDeadline: uint(64, true),
  rightsDuration: uint(64, true),
  watchPrice: uint(256, true),
  funderBps: z.number().int().min(0).max(10_000),
  repaymentCapBps: z.number().int().min(1).max(65_535),
  pitchReference: z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(value => !/^0x0{64}$/.test(value)),
  worldGated: z.boolean(),
  perHumanLimit: uint(256),
}).strict().refine(value => value.creator.toLowerCase() !== value.reviewer.toLowerCase())
  .refine(value => /^\d+$/.test(value.productionDeadline) && /^\d+$/.test(value.fundingDeadline) && BigInt(value.productionDeadline) > BigInt(value.fundingDeadline))
  .refine(value => /^[0-9]{1,78}$/.test(value.fundingGoal) && BigInt(value.fundingGoal) * BigInt(value.repaymentCapBps) <= (2n ** 256n - 1n) * 10000n);

/** Restore exact Solidity integers from the canonical API's JSON-safe immutable terms. */
export function deserializeCampaignTerms(value: unknown): CampaignTerms {
  const terms = campaignTermsInput.parse(value);
  return { ...terms, creator: terms.creator as `0x${string}`, reviewer: terms.reviewer as `0x${string}`,
    usdc: terms.usdc as `0x${string}`, pitchReference: terms.pitchReference as `0x${string}`,
    fundingGoal: BigInt(terms.fundingGoal), fundingDeadline: BigInt(terms.fundingDeadline),
    productionDeadline: BigInt(terms.productionDeadline), rightsDuration: BigInt(terms.rightsDuration),
    watchPrice: BigInt(terms.watchPrice), perHumanLimit: BigInt(terms.perHumanLimit) };
}
