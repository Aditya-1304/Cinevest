import "server-only";

import { verifiedArcClient } from "../arkiv/arc-client";
import {
  ARC_TESTNET_DEPLOYMENT,
  campaignAbi,
  campaignFactoryAbi,
} from "@cinevest/abi";
import {
  campaignTermsMatch,
  findCreatedCampaign,
  findCreatedCampaignFromTx,
  type RawLog,
} from "./arc-reconcile";
import type { ArcConfirmation, PublicationDependencies } from "./publication";

const RECENT_BLOCK_WINDOW = 50_000n;

type LogWithTx = RawLog & { transactionHash?: string | null };

/**
 * Polls a known Arc transaction, and on an uncertain receipt reconciles directly against the
 * persisted transaction hash and the actor-signed intended terms. A same-creator campaign from a
 * different deployment is never adopted, and no factory candidates are considered without the
 * intended terms recorded in the journal.
 */
export function createArcConfirmation(options: {
  expectedTerms: Record<string, unknown> | null;
}): PublicationDependencies["arc"]["confirm"] {
  return async ({ arcTxHash, actor }): Promise<ArcConfirmation> => {
    const factory = ARC_TESTNET_DEPLOYMENT.factoryAddress;
    if (!factory) throw new Error("Arc campaign factory is not configured");
    if (!ARC_TESTNET_DEPLOYMENT.compatible) throw new Error("Factory redeployment is required for the current contract revision");
    const client = await verifiedArcClient(10_000);
    const transaction = await client.getTransaction({ hash: arcTxHash as `0x${string}` });
    if (transaction.from.toLowerCase() !== actor.toLowerCase() || transaction.to?.toLowerCase() !== factory.toLowerCase()) {
      return { status: "failed", reason: "Creation transaction must be sent by the creator to the configured factory" };
    }

    const matchesTerms = async (campaign: `0x${string}`) => {
      if (!(await client.readContract({ address: factory, abi: campaignFactoryAbi, functionName: "isCampaign", args: [campaign] }))) return false;
      const terms = await client.readContract({
        address: campaign,
        abi: campaignAbi,
        functionName: "getTerms",
      });
      if (terms.creator.toLowerCase() !== actor.toLowerCase()) return false;
      return campaignTermsMatch(
        terms as unknown as Record<string, unknown>,
        options.expectedTerms,
      );
    };

    const resolveFromReceipt = async (
      receiptLogs: readonly LogWithTx[],
    ): Promise<ArcConfirmation | null> => {
      const created = findCreatedCampaign(receiptLogs, factory, actor);
      if (!created) return null;
      if (!(await matchesTerms(created))) return null;
      return { status: "confirmed", campaignAddress: created };
    };

    try {
      const receipt = await client.waitForTransactionReceipt({
        hash: arcTxHash as `0x${string}`,
        confirmations: 1,
        timeout: 45_000,
      });
      if (receipt.status !== "success") {
        return { status: "failed", reason: "Arc transaction reverted" };
      }
      const resolved = await resolveFromReceipt(receipt.logs as readonly LogWithTx[]);
      if (resolved) return resolved;
      return { status: "failed", reason: "No canonical CampaignCreated event with intended terms" };
    } catch {
      // The wallet returned a hash but the receipt is uncertain. Reconcile against the persisted
      // transaction only — never a window scan that could adopt an unrelated same-creator campaign.
      let created: `0x${string}` | null = null;
      const receipt = await client
        .getTransactionReceipt({ hash: arcTxHash as `0x${string}` })
        .catch(() => null);
      if (receipt) {
        if (receipt.status !== "success") {
          return { status: "failed", reason: "Arc transaction reverted" };
        }
        const resolved = await resolveFromReceipt(receipt.logs as readonly LogWithTx[]);
        if (resolved) return resolved;
      } else if (options.expectedTerms) {
        // The receipt is still unavailable; a last bounded scan is only safe while it is bound to
        // this exact transaction's logs and the actor-signed intended terms.
        try {
          const latest = await client.getBlockNumber();
          const fromBlock =
            latest > RECENT_BLOCK_WINDOW ? latest - RECENT_BLOCK_WINDOW : 0n;
          const logs = await client.getLogs({ address: factory, fromBlock, toBlock: latest });
          const txBound = findCreatedCampaignFromTx(
            logs as readonly LogWithTx[],
            factory,
            actor,
            arcTxHash,
          );
          if (txBound && (await matchesTerms(txBound))) created = txBound;
        } catch {
          // The provider is still unavailable; keep the journal uncertain for a later retry.
        }
      }
      if (created) return { status: "confirmed", campaignAddress: created };
      return { status: "pending" };
    }
  };
}
