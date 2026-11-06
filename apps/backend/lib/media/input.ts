import { z } from "zod";
import { ARC_TESTNET } from "@cinevest/abi";

export const arcChainId = z.literal(String(ARC_TESTNET.id));
export const campaignAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value.toLowerCase() as `0x${string}`);
