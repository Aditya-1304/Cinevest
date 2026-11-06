/**
 * Creator-owned Arkiv Rabdi writes (browser copy of apps/backend/lib/arkiv/creator-wallet.ts and
 * film-schema.ts). The backend never holds an entity-owner key; the connected creator wallet
 * signs, switching to Rabdi for the write and always back to Arc Testnet afterwards.
 */
import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import {
  createWalletClient as createEvmWallet,
  custom,
  type EIP1193Provider,
} from "viem";
import { ARC_TESTNET } from "@/lib/chain";
import { campaignTermsDigest, type CampaignTerms } from "@cinevest/abi";

// Must stay identical to apps/backend/lib/arkiv/film-schema.ts.
export const filmSchema = defineSchema("Cinevest.film.v1", {
  arcChainId: u64(),
  campaignAddress: addr().indexed(),
  creatorAddress: addr().indexed(),
  genre: str().indexed(),
  fundingDeadline: u64().indexed(),
  title: str(),
  pitchSwarmRef: str(),
  posterSwarmRef: str(),
  termsDigest: str(),
  operationDigest: str().indexed().optional(),
  createdAt: u64(),
  schemaVersion: u64(),
});

const RABDI_ID = 7_794_095;

async function switchTo(
  wallet: ReturnType<typeof createEvmWallet>,
  chain: ReturnType<typeof rabdi>,
) {
  try {
    await wallet.switchChain({ id: chain.id });
  } catch (error) {
    // 4902: the wallet does not know this chain yet.
    if ((error as { code?: number }).code !== 4902) throw error;
    await wallet.addChain({ chain });
    await wallet.switchChain({ id: chain.id });
  }
}

export type PublishListingInput = {
  campaignAddress: `0x${string}`;
  terms: CampaignTerms;
  title: string;
  genre: string;
  posterSwarmRef: string;
  operationDigest: string;
  createdAt: bigint;
};

export async function publishCreatorListing(
  provider: EIP1193Provider,
  input: PublishListingInput,
) {
  for (const value of [input.title, input.genre]) {
    if (!value.trim() || new TextEncoder().encode(value).length > 128)
      throw new Error("Arkiv text exceeds 128 UTF-8 bytes");
  }
  if (
    !/^(0x)?[0-9a-fA-F]{64}$/.test(input.posterSwarmRef) ||
    !/^[0-9a-f]{64}$/.test(input.operationDigest)
  )
    throw new Error("Invalid listing reference or operation digest");

  const chain = rabdi({ accessKey: "" });
  const wallet = createEvmWallet({ transport: custom(provider) });
  const [account] = await wallet.requestAddresses();
  if (account?.toLowerCase() !== input.terms.creator.toLowerCase())
    throw new Error("Select the campaign creator wallet");
  try {
    await switchTo(wallet, chain);
    if ((await wallet.getChainId()) !== RABDI_ID)
      throw new Error("Arkiv Rabdi is required to publish the listing");
    const client = createWalletClient({
      account,
      chain,
      transport: custom(provider),
    });
    return await client.createEntity(
      filmSchema,
      {
        arcChainId: u64(BigInt(ARC_TESTNET.id)),
        campaignAddress: addr(input.campaignAddress),
        creatorAddress: addr(input.terms.creator),
        genre: input.genre,
        fundingDeadline: u64(input.terms.fundingDeadline),
        title: input.title,
        pitchSwarmRef: input.terms.pitchReference.toLowerCase(),
        posterSwarmRef: input.posterSwarmRef.toLowerCase(),
        termsDigest: campaignTermsDigest(ARC_TESTNET.id, input.terms),
        operationDigest: input.operationDigest,
        createdAt: u64(input.createdAt),
        schemaVersion: u64(1n),
      },
      { expiration: ExpirationTime.fromDays(30), flags: { permissionlessExtension: false } },
    );
  } finally {
    // The rest of the app is Arc-only; restore the network even when the write failed.
    await wallet
      .switchChain({ id: ARC_TESTNET.id })
      .catch(() => undefined);
  }
}

export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network";

/** Extends a creator-owned listing to the absolute block authorized by /api/listings/extend. */
export async function extendCreatorListing(
  provider: EIP1193Provider,
  creator: `0x${string}`,
  entityId: `0x${string}`,
  targetBlock: bigint,
) {
  const chain = rabdi({ accessKey: "" });
  const wallet = createEvmWallet({ transport: custom(provider) });
  const [account] = await wallet.requestAddresses();
  if (account?.toLowerCase() !== creator.toLowerCase())
    throw new Error("Select the campaign creator wallet");
  try {
    await switchTo(wallet, chain);
    if ((await wallet.getChainId()) !== RABDI_ID)
      throw new Error("Arkiv Rabdi is required to extend the listing");
    const client = createWalletClient({ account, chain, transport: custom(provider) });
    return await client.extendEntity({
      entityKey: entityId,
      expiration: ExpirationTime.atBlock(targetBlock),
    });
  } finally {
    await wallet.switchChain({ id: ARC_TESTNET.id }).catch(() => undefined);
  }
}
