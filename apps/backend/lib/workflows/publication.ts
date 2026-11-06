/**
 * Durable creator-publication journal. The store is passed in so the transition contract can be
 * tested without a database; the Drizzle adapter lives in ./store.ts.
 *
 * Ordering contract: the wallet-returned Arc transaction hash is journalled before any receipt
 * polling, and an already confirmed campaign never calls the Arc deployment adapter again.
 */
import { createHash } from "node:crypto";

export const OPERATION_STATUSES = [
  "pending",
  "uploaded",
  "submitted",
  "uncertain",
  "confirmed",
  "publishing",
  "published",
  "failed",
] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

const TRANSITIONS: Record<OperationStatus, readonly OperationStatus[]> = {
  pending: ["uploaded", "submitted", "failed"],
  uploaded: ["submitted", "failed"],
  submitted: ["uncertain", "confirmed", "failed"],
  uncertain: ["confirmed", "failed"],
  confirmed: ["publishing", "failed"],
  // A publishing entry can journal its Arkiv transaction in place without losing its CAS slot.
  publishing: ["publishing", "published", "confirmed", "failed"],
  published: [],
  failed: [],
};

export type WorkflowOperation = {
  id: string;
  actor: string;
  arcChainId: string;
  campaignAddress: string | null;
  requestDigest: string;
  /** The actor-signed intended campaign terms; binds reconciliation to the registered identity. */
  termsJson: string | null;
  swarmReference: string | null;
  arcTxHash: string | null;
  arkivTxHash: string | null;
  arkivEntityId: string | null;
  status: OperationStatus;
  retryCount: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type OperationPatch = Partial<
  Pick<
    WorkflowOperation,
    | "campaignAddress"
    | "termsJson"
    | "swarmReference"
    | "arcTxHash"
    | "arkivTxHash"
    | "arkivEntityId"
  >
>;

export type TransitionInput = {
  id: string;
  actor: string;
  expected: OperationStatus;
  expectedRevision: number;
  next: OperationStatus;
  patch?: OperationPatch;
  incrementRetry?: boolean;
};

/** The store's transition must be a single compare-and-set update returning null on conflict. */
export interface WorkflowStore {
  insert(operation: WorkflowOperation): Promise<WorkflowOperation | null>;
  find(actor: string, requestDigest: string): Promise<WorkflowOperation | null>;
  transition(input: TransitionInput): Promise<WorkflowOperation | null>;
}

export class PublicationConflictError extends Error {
  constructor(message = "Publication identity conflict") {
    super(message);
    this.name = "PublicationConflictError";
  }
}

export class PublicationStateError extends Error {
  constructor(message = "Publication changed concurrently") {
    super(message);
    this.name = "PublicationStateError";
  }
}

export function canonicalActor(actor: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(actor)) throw new Error("Invalid actor");
  return actor.toLowerCase();
}

export function canonicalCampaign(address: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Invalid campaign address");
  return address.toLowerCase();
}

export function canonicalTransaction(hash: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Invalid transaction hash");
  return hash.toLowerCase();
}

export function stableStringify(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function publicationDigest(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function canTransition(from: OperationStatus, to: OperationStatus) {
  return TRANSITIONS[from].includes(to);
}

async function advance(
  store: WorkflowStore,
  operation: WorkflowOperation,
  next: OperationStatus,
  patch?: OperationPatch,
  incrementRetry = false,
) {
  if (!canTransition(operation.status, next)) {
    throw new PublicationStateError(
      `Cannot move publication from ${operation.status} to ${next}`,
    );
  }
  const updated = await store.transition({
    id: operation.id,
    actor: operation.actor,
    expected: operation.status,
    expectedRevision: operation.revision,
    next,
    patch,
    incrementRetry,
  });
  if (!updated) throw new PublicationStateError();
  return updated;
}

export async function beginPublication(
  store: WorkflowStore,
  input: {
    id: string;
    actor: string;
    arcChainId: number | string;
    requestDigest: string;
    swarmReference?: string | null;
    termsJson?: string | null;
  },
) {
  const actor = canonicalActor(input.actor);
  const arcChainId = String(input.arcChainId);
  if (arcChainId !== "5042002") throw new PublicationConflictError("Only Arc Testnet campaigns are supported");
  const now = new Date();
  const inserted = await store.insert({
    id: input.id,
    actor,
    arcChainId,
    campaignAddress: null,
    requestDigest: input.requestDigest,
    termsJson: input.termsJson ?? null,
    swarmReference: input.swarmReference ?? null,
    arcTxHash: null,
    arkivTxHash: null,
    arkivEntityId: null,
    status: "pending",
    retryCount: 0,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });
  const operation = inserted ?? (await store.find(actor, input.requestDigest));
  if (!operation) throw new PublicationStateError("Publication record is unavailable");
  if (operation.arcChainId !== arcChainId) throw new PublicationConflictError();
  return { operation, created: Boolean(inserted) };
}

export async function findPublication(
  store: WorkflowStore,
  actor: string,
  requestDigest: string,
) {
  return store.find(canonicalActor(actor), requestDigest);
}

/** Persist the wallet-returned hash before calling any receipt or factory reconciliation code. */
export async function recordArcTransaction(
  store: WorkflowStore,
  input: {
    id: string;
    actor: string;
    arcChainId: number | string;
    requestDigest: string;
    arcTxHash: string;
    swarmReference?: string | null;
    termsJson?: string | null;
  },
) {
  const { operation } = await beginPublication(store, input);
  const arcTxHash = canonicalTransaction(input.arcTxHash);
  if (operation.arcTxHash && operation.arcTxHash !== arcTxHash) {
    throw new PublicationConflictError("A different Arc transaction is already recorded");
  }
  if (input.termsJson && operation.termsJson && operation.termsJson !== input.termsJson) {
    throw new PublicationConflictError("Intended terms differ from the recorded publication");
  }
  if (operation.status === "failed") throw new PublicationConflictError();
  if (operation.status === "pending" || operation.status === "uploaded") {
    return advance(store, operation, "submitted", {
      arcTxHash,
      ...(input.termsJson && !operation.termsJson ? { termsJson: input.termsJson } : {}),
      ...(input.swarmReference ? { swarmReference: input.swarmReference } : {}),
    });
  }
  return operation;
}

/**
 * Journals the creator-owned Arkiv write before its receipt is treated as authoritative. A
 * recorded hash is immutable, so a lost response is reconciled through the entity lookup rather
 * than resubmitted.
 */
export async function recordArkivTransaction(
  store: WorkflowStore,
  input: {
    actor: string;
    requestDigest: string;
    arkivTxHash?: string | null;
    arkivEntityId?: string | null;
  },
) {
  const operation = await store.find(canonicalActor(input.actor), input.requestDigest);
  if (!operation) throw new PublicationStateError("Publication record is unavailable");
  const arkivTxHash = input.arkivTxHash ? canonicalTransaction(input.arkivTxHash) : null;
  const arkivEntityId = input.arkivEntityId ? canonicalTransaction(input.arkivEntityId) : null;
  if (
    (operation.arkivTxHash && arkivTxHash && operation.arkivTxHash !== arkivTxHash) ||
    (operation.arkivEntityId && arkivEntityId && operation.arkivEntityId !== arkivEntityId)
  ) {
    throw new PublicationConflictError("A different Arkiv write is already recorded");
  }
  if (operation.status === "published") return operation;
  const patch: OperationPatch = {
    ...(arkivTxHash && !operation.arkivTxHash ? { arkivTxHash } : {}),
    ...(arkivEntityId && !operation.arkivEntityId ? { arkivEntityId } : {}),
  };
  if (operation.status === "confirmed") {
    return advance(store, await beginArkivPublication(store, operation.actor, operation.requestDigest), "publishing", patch);
  }
  if (operation.status === "publishing") {
    return advance(store, operation, "publishing", patch);
  }
  throw new PublicationStateError("Campaign must be confirmed before Arkiv publication");
}

export type ArcConfirmation =
  | { status: "confirmed"; campaignAddress: string }
  | { status: "pending" }
  | { status: "failed"; reason?: string };

export async function recordArcConfirmation(
  store: WorkflowStore,
  actor: string,
  requestDigest: string,
  confirmation: ArcConfirmation,
) {
  const operation = await store.find(canonicalActor(actor), requestDigest);
  if (!operation) throw new PublicationStateError("Publication record is unavailable");
  if (confirmation.status === "pending") {
    if (operation.status === "submitted") return advance(store, operation, "uncertain");
    return operation;
  }
  if (confirmation.status === "failed") {
    if (operation.status === "submitted" || operation.status === "uncertain") {
      return advance(store, operation, "failed");
    }
    return operation;
  }
  const campaignAddress = canonicalCampaign(confirmation.campaignAddress);
  if (
    operation.status === "submitted" ||
    operation.status === "uncertain"
  ) {
    return advance(store, operation, "confirmed", { campaignAddress });
  }
  if (
    operation.status === "confirmed" ||
    operation.status === "publishing" ||
    operation.status === "published"
  ) {
    if (operation.campaignAddress && operation.campaignAddress !== campaignAddress) {
      throw new PublicationConflictError("A different campaign is already confirmed");
    }
    return operation;
  }
  throw new PublicationStateError("Arc confirmation arrived in an invalid state");
}

export async function beginArkivPublication(
  store: WorkflowStore,
  actor: string,
  requestDigest: string,
) {
  const operation = await store.find(canonicalActor(actor), requestDigest);
  if (!operation) throw new PublicationStateError("Publication record is unavailable");
  if (operation.status === "publishing" || operation.status === "published") {
    return operation;
  }
  if (operation.status !== "confirmed") {
    throw new PublicationStateError("Campaign must be confirmed before Arkiv publication");
  }
  return advance(store, operation, "publishing");
}

export async function completeArkivPublication(
  store: WorkflowStore,
  actor: string,
  requestDigest: string,
  published: { entityId: string; txHash?: string | null },
) {
  const operation = await store.find(canonicalActor(actor), requestDigest);
  if (!operation) throw new PublicationStateError("Publication record is unavailable");
  if (operation.status === "published") return operation;
  if (operation.status !== "publishing") {
    throw new PublicationStateError("Arkiv publication was not started");
  }
  return advance(store, operation, "published", {
    arkivEntityId: canonicalTransaction(published.entityId),
    arkivTxHash: published.txHash ? canonicalTransaction(published.txHash) : operation.arkivTxHash,
  });
}

/** Clears an Arkiv transaction only after its receipt proves it reverted. */
/**
 * Reopens a listing slot whose creator reports that no Arkiv transaction was produced (for example
 * a wallet without tGLM). Only valid while no transaction or entity ID is journalled; callers must
 * first rule out an indexed entity and wait out the index delay.
 */
export async function resetUnsentArkivPublication(
  store: WorkflowStore,
  actor: string,
  requestDigest: string,
) {
  const operation = await store.find(canonicalActor(actor), requestDigest);
  if (!operation) throw new PublicationStateError("Publication record is unavailable");
  if (operation.status !== "publishing") {
    throw new PublicationStateError("Arkiv publication is not awaiting reconciliation");
  }
  if (operation.arkivTxHash || operation.arkivEntityId) {
    throw new PublicationConflictError("An Arkiv write is already journalled for this publication");
  }
  return advance(store, operation, "confirmed", undefined, true);
}

export async function retryFailedArkivPublication(
  store: WorkflowStore,
  actor: string,
  requestDigest: string,
  failedTxHash: string,
) {
  const operation = await store.find(canonicalActor(actor), requestDigest);
  if (!operation) throw new PublicationStateError("Publication record is unavailable");
  if (operation.status !== "publishing") {
    throw new PublicationStateError("Arkiv publication is not awaiting reconciliation");
  }
  if (operation.arkivTxHash !== canonicalTransaction(failedTxHash)) {
    throw new PublicationConflictError("The failed Arkiv transaction is not the journalled write");
  }
  return advance(
    store,
    operation,
    "confirmed",
    { arkivTxHash: null, arkivEntityId: null },
    true,
  );
}

export type PublicationStep =
  | "swarm-upload"
  | "deploy"
  | "arc-confirmation"
  | "arkiv-publication"
  | "complete"
  | "failed";

export type PublicationOutcome = {
  operation: WorkflowOperation;
  nextStep: PublicationStep;
  retryable: boolean;
};

export type PublicationDependencies = {
  swarm?: {
    upload?: (payload: unknown) => Promise<string>;
  };
  arc: {
    deploy?: (terms: unknown) => Promise<string>;
    confirm: (input: {
      arcTxHash: string;
      actor: string;
      campaignAddress: string | null;
    }) => Promise<ArcConfirmation>;
  };
  arkiv?: {
    publish?: (operation: WorkflowOperation) => Promise<{
      entityId: string;
      txHash?: string | null;
    }>;
    find?: (operation: WorkflowOperation) => Promise<{
      entityId: string;
      txHash?: string | null;
    } | null>;
  };
};

export type PublicationInput = {
  id: string;
  actor: string;
  arcChainId: number | string;
  requestDigest: string;
  swarmReference?: string | null;
  arcTxHash?: string | null;
  terms?: unknown;
  termsJson?: string | null;
  payload?: unknown;
};

export async function runPublication(
  store: WorkflowStore,
  dependencies: PublicationDependencies,
  input: PublicationInput,
): Promise<PublicationOutcome> {
  let { operation } = await beginPublication(store, input);

  if (
    !operation.swarmReference &&
    dependencies.swarm?.upload &&
    input.payload !== undefined
  ) {
    let reference: string;
    try {
      reference = await dependencies.swarm.upload(input.payload);
    } catch {
      return { operation, nextStep: "swarm-upload", retryable: true };
    }
    operation = await advance(store, operation, "uploaded", {
      swarmReference: reference,
    });
  }

  if (!operation.arcTxHash) {
    if (input.arcTxHash) {
      operation = await recordArcTransaction(store, {
        ...input,
        arcTxHash: input.arcTxHash,
        swarmReference: operation.swarmReference,
      });
    } else if (dependencies.arc.deploy) {
      let arcTxHash: string;
      try {
        arcTxHash = await dependencies.arc.deploy(input.terms);
      } catch {
        return { operation, nextStep: "deploy", retryable: true };
      }
      // Journal the hash immediately; no receipt polling happens before this write.
      operation = await recordArcTransaction(store, {
        ...input,
        arcTxHash,
        swarmReference: operation.swarmReference,
      });
    } else {
      return { operation, nextStep: "deploy", retryable: true };
    }
  }

  if (operation.status === "submitted" || operation.status === "uncertain") {
    let confirmation: ArcConfirmation;
    try {
      confirmation = await dependencies.arc.confirm({
        arcTxHash: operation.arcTxHash!,
        actor: operation.actor,
        campaignAddress: operation.campaignAddress,
      });
    } catch {
      confirmation = { status: "pending" };
    }
    operation = await recordArcConfirmation(
      store,
      operation.actor,
      operation.requestDigest,
      confirmation,
    );
  }

  if (operation.status === "publishing") {
    const existing = dependencies.arkiv?.find
      ? await dependencies.arkiv.find(operation)
      : null;
    if (existing) {
      operation = await completeArkivPublication(
        store,
        operation.actor,
        operation.requestDigest,
        existing,
      );
    } else {
      // Absence from an index does not prove a submitted write failed. Preserve uncertainty
      // until its transaction receipt is reconciled; never grant a blind createEntity retry.
      return { operation, nextStep: "arkiv-publication", retryable: true };
    }
  }

  if (operation.status === "confirmed") {
    const existing = dependencies.arkiv?.find
      ? await dependencies.arkiv.find(operation)
      : null;
    if (existing) {
      operation = await beginArkivPublication(
        store,
        operation.actor,
        operation.requestDigest,
      );
      operation = await completeArkivPublication(
        store,
        operation.actor,
        operation.requestDigest,
        existing,
      );
    } else if (dependencies.arkiv?.publish) {
      operation = await beginArkivPublication(
        store,
        operation.actor,
        operation.requestDigest,
      );
      try {
        const published = await dependencies.arkiv.publish(operation);
        operation = await completeArkivPublication(
          store,
          operation.actor,
          operation.requestDigest,
          published,
        );
      } catch {
        return { operation, nextStep: "arkiv-publication", retryable: true };
      }
    } else {
      return { operation, nextStep: "arkiv-publication", retryable: true };
    }
  }

  if (operation.status === "published") {
    return { operation, nextStep: "complete", retryable: false };
  }
  if (operation.status === "failed") {
    return { operation, nextStep: "failed", retryable: false };
  }
  if (operation.status === "submitted" || operation.status === "uncertain") {
    return { operation, nextStep: "arc-confirmation", retryable: true };
  }
  if (operation.status === "pending" || operation.status === "uploaded") {
    return { operation, nextStep: "deploy", retryable: true };
  }
  return { operation, nextStep: "arkiv-publication", retryable: true };
}
