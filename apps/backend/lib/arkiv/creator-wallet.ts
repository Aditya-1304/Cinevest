import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, u64 } from "@arkiv-network/sdk/schema";
import { createWalletClient as createEvmWallet, custom, type EIP1193Provider } from "viem";
import { ARC_TESTNET, campaignTermsDigest, type CampaignTerms } from "@cinevest/abi";
import { filmSchema } from "./film-schema";

/**
 * Browser-safe adapter for the frontend teammate. Writes belong to the connected creator's
 * Rabdi account; the backend has no entity-owner key and can only reconcile public results.
 * Pass immutable terms obtained from the canonical Arc detail endpoint, not editable form data.
 */
export async function createCreatorWallet(provider: EIP1193Provider, creator: `0x${string}`) {
  const chain = rabdi({ accessKey: "" });
  const wallet = createEvmWallet({ transport: custom(provider) });
  const [account] = await wallet.requestAddresses();
  if (account?.toLowerCase() !== creator.toLowerCase()) throw new Error("Select the campaign creator wallet");
  await wallet.switchChain({ id: chain.id });
  if (await wallet.getChainId() !== 7_794_095) throw new Error("Arkiv Rabdi is required");
  const client = createWalletClient({ account, chain, transport: custom(provider) });
  return client;
}

/** Publish only after the backend journal confirms Arc creation and permits the missing listing write. */
export async function publishCreatorListing(provider: EIP1193Provider, input: {
  campaignAddress: `0x${string}`; terms: CampaignTerms; title: string; genre: string;
  posterSwarmRef: string; operationDigest: string; createdAt: bigint;
}) {
  const client = await createCreatorWallet(provider, input.terms.creator);
  for (const value of [input.title, input.genre]) {
    if (!value.trim() || new TextEncoder().encode(value).length > 128) throw new Error("Arkiv text exceeds 128 UTF-8 bytes");
  }
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(input.posterSwarmRef) || !/^[0-9a-f]{64}$/.test(input.operationDigest)) throw new Error("Invalid listing reference or operation digest");
  return client.createEntity(filmSchema, {
    arcChainId: u64(BigInt(ARC_TESTNET.id)), campaignAddress: addr(input.campaignAddress),
    creatorAddress: addr(input.terms.creator), genre: input.genre,
    fundingDeadline: u64(input.terms.fundingDeadline), title: input.title,
    pitchSwarmRef: input.terms.pitchReference.toLowerCase(), posterSwarmRef: input.posterSwarmRef.toLowerCase(),
    termsDigest: campaignTermsDigest(ARC_TESTNET.id, input.terms), operationDigest: input.operationDigest,
    createdAt: u64(input.createdAt), schemaVersion: u64(1n),
  }, { expiration: ExpirationTime.fromDays(30), flags: { permissionlessExtension: false } });
}

/** Use the absolute block authorized by /api/listings/extend, making retries semantically idempotent. */
export async function extendCreatorListing(provider: EIP1193Provider, creator: `0x${string}`, entityId: `0x${string}`, targetBlock: bigint) {
  const client = await createCreatorWallet(provider, creator);
  return client.extendEntity({ entityKey: entityId, expiration: ExpirationTime.atBlock(targetBlock) });
}
