"use client";

/**
 * Creator publication flow: Swarm poster -> pitch commitment -> journal prepare -> Arc deploy ->
 * journal register/reconcile -> creator-owned Arkiv listing. Every boundary is saved to
 * localStorage as soon as it exists, so an interrupted flow resumes from the last confirmed
 * step and never deploys a second campaign for the same journal digest.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeEventLog, type EIP1193Provider, type Hash } from "viem";
import { getAccount } from "wagmi/actions";
import {
  useAccount,
  useConfig,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { campaignFactoryAbi } from "@cinevest/abi";
import { ARC_TESTNET, ARC_TESTNET_DEPLOYMENT } from "@/lib/chain";
import { transactionErrorMessage } from "@/lib/transaction-error";
import { publishCreatorListing } from "@/lib/arkiv-creator";
import { encodePitch, pitchReference } from "@/lib/pitch-manifest";
import {
  fromWireTerms,
  signedPost,
  toWireTerms,
  type SignMessage,
  type WireTerms,
} from "@/lib/publication-client";

export type StepKey = "poster" | "pitch" | "prepare" | "deploy" | "confirm" | "list";
export const PUBLICATION_STEPS: { key: StepKey; label: string }[] = [
  { key: "poster", label: "Upload poster to Swarm" },
  { key: "pitch", label: "Commit the pitch (Swarm reference)" },
  { key: "prepare", label: "Open the publication journal" },
  { key: "deploy", label: "Deploy the campaign on Arc" },
  { key: "confirm", label: "Confirm the campaign with the journal" },
  { key: "list", label: "Publish the Arkiv listing" },
];
export type StepStatus = "idle" | "active" | "done" | "error";

export type PublicationRecord = {
  actor: string;
  createdAt: number;
  title: string;
  genre: string;
  synopsis: string;
  rightsNotice: string;
  posterRef?: string;
  terms?: WireTerms;
  digest?: string;
  swarmReference?: string;
  arcTxHash?: Hash;
  registered?: boolean;
  campaign?: `0x${string}`;
  confirmed?: boolean;
  entityId?: string;
  arkivTxHash?: string;
  published?: boolean;
};

export type PublicationDraft = {
  title: string;
  genre: string;
  synopsis: string;
  rightsNotice: string;
  poster: { contentType: string; base64: string };
  terms: Parameters<typeof toWireTerms>[0];
};

class FlowError extends Error {}

const storageKey = (actor: string) => `cinevest.publication.v1:${actor.toLowerCase()}`;
function loadRecord(actor: string): PublicationRecord | undefined {
  try {
    const raw = window.localStorage.getItem(storageKey(actor));
    return raw ? (JSON.parse(raw) as PublicationRecord) : undefined;
  } catch {
    return undefined;
  }
}
function saveRecord(record: PublicationRecord) {
  try {
    window.localStorage.setItem(storageKey(record.actor), JSON.stringify(record));
  } catch {
    /* Storage can be blocked; the flow still runs but cannot resume after a reload. */
  }
}
function clearRecord(actor: string) {
  try {
    window.localStorage.removeItem(storageKey(actor));
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errorText = (data: unknown, fallback: string) =>
  typeof (data as { error?: unknown })?.error === "string"
    ? (data as { error: string }).error
    : fallback;

function stepDone(key: StepKey, r?: PublicationRecord) {
  if (!r) return false;
  switch (key) {
    case "poster": return !!r.posterRef;
    case "pitch": return !!r.terms?.pitchReference;
    case "prepare": return !!r.digest;
    case "deploy": return !!r.arcTxHash && !!r.registered;
    case "confirm": return !!r.campaign && !!r.confirmed;
    case "list": return !!r.published;
  }
}

export function usePublication() {
  const config = useConfig();
  const { address, connector, chainId } = useAccount();
  const client = usePublicClient({ chainId: ARC_TESTNET.id });
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const writer = useWriteContract();
  const [record, setRecord] = useState<PublicationRecord>();
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<StepKey>();
  const [failed, setFailed] = useState<StepKey>();
  const [message, setMessage] = useState("");
  const busy = useRef(false);

  // Offer to resume an unfinished record for the connected wallet.
  useEffect(() => {
    if (!address || busy.current) return;
    setRecord(loadRecord(address));
  }, [address]);

  // After the Rabdi write the wallet reports a chain wagmi does not know; signing only works
  // once wagmi has seen the switch back to Arc.
  const waitForArc = useCallback(async () => {
    for (let i = 0; i < 40; i++) {
      if (getAccount(config).chainId === ARC_TESTNET.id) return;
      await sleep(250);
    }
  }, [config]);

  const sign: SignMessage = useCallback(
    (text) => signMessageAsync({ message: text }),
    [signMessageAsync],
  );

  const execute = useCallback(
    async (start: PublicationRecord, draft?: PublicationDraft) => {
      if (!address || !client || busy.current) return;
      busy.current = true;
      setRunning(true);
      setFailed(undefined);
      let rec = start;
      const patch = (next: Partial<PublicationRecord>) => {
        rec = { ...rec, ...next };
        saveRecord(rec);
        setRecord(rec);
      };
      const mark = (key: StepKey, text: string) => {
        setActive(key);
        setMessage(text);
      };
      let current: StepKey = "poster";
      let submitted = false;
      try {
        const actor = address;
        const factory = ARC_TESTNET_DEPLOYMENT.factoryAddress;

        if (!rec.posterRef) {
          if (!draft) throw new FlowError("The poster is missing; discard this record and start again.");
          current = "poster";
          mark(current, "Sign to upload the poster to Swarm…");
          const res = await signedPost<{ reference?: string }>(
            "/api/artifacts",
            { action: "artifact-upload", actor, kind: "poster", payload: draft.poster },
            sign,
          );
          if (!res.ok || !res.data.reference)
            throw new FlowError(errorText(res.data, "Poster upload failed. Swarm may be unavailable; try again."));
          patch({ posterRef: res.data.reference });
        }

        if (!rec.terms?.pitchReference) {
          if (!draft) throw new FlowError("The terms are missing; discard this record and start again.");
          current = "pitch";
          mark(current, "Building the pitch manifest…");
          const { bytes } = encodePitch({
            title: rec.title,
            synopsis: rec.synopsis,
            posterRef: rec.posterRef!,
            genre: rec.genre,
            creator: actor,
            rightsNotice: rec.rightsNotice,
          });
          const reference = await pitchReference(bytes);
          patch({ terms: toWireTerms({ ...draft.terms, pitchReference: reference }) });
        }

        if (!rec.digest) {
          current = "prepare";
          mark(current, "Sign to open the publication journal (uploads the pitch to Swarm)…");
          const manifest = {
            title: rec.title.trim(),
            synopsis: rec.synopsis.trim(),
            posterRef: rec.posterRef!.replace(/^0x/i, "").toLowerCase(),
            genre: rec.genre.trim(),
            creator: actor.toLowerCase(),
            rightsNotice: rec.rightsNotice.trim(),
          };
          const res = await signedPost<{ digest?: string; swarmReference?: string }>(
            "/api/publications",
            { action: "prepare", actor, arcChainId: ARC_TESTNET.id, terms: rec.terms, manifest },
            sign,
          );
          if (res.status !== 202 || !res.data.digest)
            throw new FlowError(errorText(res.data, "The publication journal rejected the request."));
          // The journal returns the reference without 0x; later requests require the prefixed form.
          const swarmReference = res.data.swarmReference
            ? `0x${res.data.swarmReference.replace(/^0x/i, "").toLowerCase()}`
            : undefined;
          patch({ digest: res.data.digest, swarmReference });
        }

        if (!rec.arcTxHash) {
          current = "deploy";
          if (!factory) throw new FlowError("The campaign factory is not configured.");
          if (chainId !== ARC_TESTNET.id) await switchChainAsync({ chainId: ARC_TESTNET.id });
          mark(current, "Confirm the campaign deployment in your wallet…");
          const terms = fromWireTerms(rec.terms!);
          const simulation = await client.simulateContract({
            address: factory,
            abi: campaignFactoryAbi,
            functionName: "createCampaign",
            args: [terms],
            account: actor,
          });
          const hash = await writer.writeContractAsync({ ...simulation.request, chainId: ARC_TESTNET.id });
          submitted = true;
          patch({ arcTxHash: hash });
        }
        if (!rec.registered) {
          current = "deploy";
          mark(current, "Sign to record the deployment transaction in the journal…");
          const res = await signedPost(
            "/api/publications",
            {
              action: "register",
              actor,
              arcChainId: ARC_TESTNET.id,
              terms: rec.terms,
              arcTxHash: rec.arcTxHash,
              swarmReference: rec.swarmReference,
            },
            sign,
          );
          if (res.status !== 202 && !res.ok)
            throw new FlowError(errorText(res.data, "Could not record the deployment in the journal."));
          patch({ registered: true });
        }

        if (!rec.campaign) {
          current = "confirm";
          mark(current, "Waiting for the Arc receipt…");
          submitted = true;
          const receipt = await client.waitForTransactionReceipt({
            hash: rec.arcTxHash!,
            confirmations: 1,
            timeout: 120_000,
          });
          if (receipt.status !== "success") throw new FlowError("The deployment transaction reverted.");
          let campaign: `0x${string}` | undefined;
          for (const log of receipt.logs) {
            if (!factory || log.address.toLowerCase() !== factory.toLowerCase()) continue;
            try {
              const event = decodeEventLog({
                abi: campaignFactoryAbi,
                eventName: "CampaignCreated",
                data: log.data,
                topics: log.topics,
              });
              campaign = event.args.campaign;
              break;
            } catch {
              /* Other factory logs do not identify the new campaign. */
            }
          }
          if (!campaign)
            throw new FlowError("Deployment confirmed, but the new campaign address was not found. Check the transaction on the explorer.");
          patch({ campaign });
        }
        if (!rec.confirmed) {
          current = "confirm";
          for (let attempt = 0; attempt < 3 && !rec.confirmed; attempt++) {
            mark(current, "Sign to let the journal confirm the campaign on Arc…");
            const res = await signedPost<{ status?: string }>(
              "/api/publications",
              { action: "reconcile", actor, digest: rec.digest },
              sign,
            );
            if (res.ok && ["confirmed", "publishing", "published"].includes(res.data.status ?? "")) {
              patch({ confirmed: true });
            } else if (attempt < 2) {
              await sleep(4000);
            }
          }
          if (!rec.confirmed)
            throw new FlowError("The journal has not confirmed the campaign yet. Press Resume to check again; no second deployment will be sent.");
        }

        if (!rec.published) {
          current = "list";
          const campaign = rec.campaign!;
          mark(current, "Sign to request the Arkiv listing slot…");
          let status: string | undefined;
          if (!rec.entityId && !rec.arkivTxHash) {
            const slot = await signedPost<{ status?: string; authorized?: boolean }>(
              "/api/publications",
              { action: "arkiv", actor, digest: rec.digest },
              sign,
            );
            status = slot.data.status;
            if (slot.status === 409 && slot.data.authorized) {
              const detailRes = await fetch(`/api/film/${ARC_TESTNET.id}/${campaign}`, { cache: "no-store" });
              const detail = (await detailRes.json()) as { terms?: WireTerms };
              if (!detailRes.ok || !detail.terms)
                throw new FlowError("Could not read the confirmed campaign terms from Arc.");
              const provider = (await connector?.getProvider()) as EIP1193Provider | undefined;
              if (!provider) throw new FlowError("No wallet provider is available to sign the Arkiv listing.");
              mark(current, "Confirm the Arkiv listing in your wallet (network: Arkiv Rabdi)…");
              let created;
              try {
                created = await publishCreatorListing(provider, {
                  campaignAddress: campaign,
                  terms: fromWireTerms(detail.terms),
                  title: rec.title.trim(),
                  genre: rec.genre.trim(),
                  posterSwarmRef: rec.posterRef!,
                  operationDigest: rec.digest!,
                  createdAt: BigInt(rec.createdAt),
                });
              } catch (error) {
                await waitForArc();
                const text = error instanceof Error ? (error.message.split(/\r?\n/)[0] ?? "") : "unknown error";
                throw new FlowError(
                  /reject|denied/i.test(text)
                    ? "The Arkiv listing was rejected in your wallet. The campaign is live on Arc; press Resume to list it."
                    : `The Arkiv listing could not be sent: ${text.slice(0, 160)}. The campaign is live on Arc; press Resume to retry.`,
                );
              }
              await waitForArc();
              patch({ entityId: created.entityKey, arkivTxHash: created.txHash });
            } else if (!slot.ok && slot.status !== 202) {
              throw new FlowError(errorText(slot.data, "The journal did not authorize the Arkiv listing."));
            }
          }
          if (status !== "published" && (rec.entityId || rec.arkivTxHash)) {
            mark(current, "Sign to record the Arkiv listing in the journal…");
            await signedPost(
              "/api/publications",
              { action: "arkiv", actor, digest: rec.digest, entityId: rec.entityId, arkivTxHash: rec.arkivTxHash },
              sign,
            );
          }
          mark(current, "Waiting for the listing to appear on Arkiv…");
          for (let attempt = 0; attempt < 30; attempt++) {
            const check = await fetch(`/api/publications?actor=${actor}&digest=${rec.digest}`, { cache: "no-store" });
            const data = (await check.json().catch(() => ({}))) as { status?: string };
            if (data.status === "published") break;
            if (attempt === 29)
              throw new FlowError("The listing was sent but Arkiv has not indexed it yet. The campaign is live on Arc; press Resume to check again.");
            await sleep(3000);
          }
          patch({ published: true });
        }
        setActive(undefined);
        setMessage("Campaign published.");
      } catch (error) {
        setFailed(current);
        setActive(undefined);
        setMessage(
          error instanceof FlowError ? error.message : transactionErrorMessage(error, submitted),
        );
      } finally {
        busy.current = false;
        setRunning(false);
      }
    },
    [address, chainId, client, connector, sign, switchChainAsync, waitForArc, writer],
  );

  const start = useCallback(
    (draft: PublicationDraft) => {
      if (!address) return;
      const fresh: PublicationRecord = {
        actor: address,
        createdAt: Math.floor(Date.now() / 1000),
        title: draft.title,
        genre: draft.genre,
        synopsis: draft.synopsis,
        rightsNotice: draft.rightsNotice,
      };
      saveRecord(fresh);
      setRecord(fresh);
      void execute(fresh, draft);
    },
    [address, execute],
  );

  const resume = useCallback(() => {
    if (record) void execute(record);
  }, [execute, record]);

  // A record can be dropped only while no Arc transaction exists for it.
  const discard = useCallback(() => {
    if (!address || record?.arcTxHash) return;
    clearRecord(address);
    setRecord(undefined);
    setFailed(undefined);
    setMessage("");
  }, [address, record]);

  const steps = PUBLICATION_STEPS.map((step) => ({
    ...step,
    status: (stepDone(step.key, record)
      ? "done"
      : failed === step.key
        ? "error"
        : active === step.key
          ? "active"
          : "idle") as StepStatus,
  }));

  return { steps, record, running, message, failed, start, resume, discard };
}
