import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyMessage } from "viem";
import { ARC_TESTNET } from "@cinevest/abi";
import { createWorkflowStore } from "@/lib/workflows/store";
import { createArcConfirmation } from "@/lib/workflows/arc-adapter";
import { findOwnedFilmEntity } from "@/lib/arkiv/verify-entity";
import { uploadPublicBytes } from "@/lib/swarm/bee";
import { encodePitch } from "@/lib/swarm/pitch";
import { referenceMatches } from "@/lib/swarm/artifact-validation";
import { campaignTermsInput } from "@/lib/workflows/terms-input";
import { readJson } from "@/lib/http";
import { getArkivReceiptStatus } from "@/lib/workflows/arkiv-adapter";
import { sessionAuthorizes } from "@/lib/wallet-auth";
import {
  publicationMessage,
  publicationMessageIsRecent,
} from "@/lib/workflows/publication-request";
import {
  findPublication,
  beginArkivPublication,
  publicationDigest,
  PublicationConflictError,
  PublicationStateError,
  recordArkivTransaction,
  recordArcTransaction,
  resetUnsentArkivPublication,
  retryFailedArkivPublication,
  runPublication,
  type PublicationStep,
  type WorkflowOperation,
} from "@/lib/workflows/publication";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const issuedAt = z.int().positive();
const signature = z.string().regex(/^0x[0-9a-fA-F]+$/).optional();
const terms = campaignTermsInput;

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"), actor: address, arcChainId: z.literal(ARC_TESTNET.id),
    terms, manifest: z.record(z.string(), z.unknown()), issuedAt, signature,
  }),
  z.object({
    action: z.literal("swarm"),
    actor: address,
    title: z.string().min(1).max(256),
    genre: z.string().min(1).max(128),
    synopsis: z.string().min(1).max(16_384),
    posterRef: hex32,
    rightsNotice: z.string().min(1).max(4096),
    issuedAt,
    signature,
  }),
  z.object({
    action: z.literal("register"),
    actor: address,
    arcChainId: z.literal(ARC_TESTNET.id),
    terms,
    arcTxHash: hex32,
    swarmReference: hex32.optional(),
    issuedAt,
    signature,
  }),
  z.object({
    action: z.literal("reconcile"),
    actor: address,
    digest,
    issuedAt,
    signature,
  }),
  z.object({
    action: z.literal("arkiv"),
    actor: address,
    digest,
    entityId: hex32.optional(),
    arkivTxHash: hex32.optional(),
    // The creator reports that no Arkiv transaction was produced; see the publishing branch below.
    retry: z.literal(true).optional(),
    issuedAt,
    signature,
  }),
]);

// Index delay allowance before an unsent listing slot may be reopened.
const UNSENT_RETRY_AFTER_MS = 120_000;

function stepForStatus(status: WorkflowOperation["status"]): PublicationStep {
  if (status === "published") return "complete";
  if (status === "failed") return "failed";
  if (status === "confirmed" || status === "publishing") return "arkiv-publication";
  if (status === "pending" || status === "uploaded") return "deploy";
  return "arc-confirmation";
}

function serialize(operation: WorkflowOperation, nextStep?: PublicationStep, retryable?: boolean) {
  return {
    id: operation.id,
    digest: operation.requestDigest,
    actor: operation.actor,
    status: operation.status,
    campaignAddress: operation.campaignAddress,
    arcChainId: operation.arcChainId,
    swarmReference: operation.swarmReference,
    arcTxHash: operation.arcTxHash,
    arkivTxHash: operation.arkivTxHash,
    arkivEntityId: operation.arkivEntityId,
    retryCount: operation.retryCount,
    nextStep: nextStep ?? stepForStatus(operation.status),
    retryable: retryable ?? (operation.status !== "published" && operation.status !== "failed"),
    updatedAt: operation.updatedAt.toISOString(),
  };
}

function unauthorized() {
  return NextResponse.json(
    { error: "Publication writes require the actor's wallet signature" },
    { status: 401 },
  );
}

/**
 * Every write is bound to the actor's wallet: the actor signs a canonical, short-lived message
 * rebuilt from the parsed request, so a stray actor field cannot poison a journal entry.
 */
async function authorize(request: Request, payload: Record<string, unknown>) {
  const { signature: signatureText, ...messagePayload } = payload;
  const actor = messagePayload.actor;
  if (typeof actor !== "string" || !address.safeParse(actor).success) return false;
  // A SIWE session replaces the per-request signature: one sign-in authorizes the whole publication.
  if (signatureText === undefined) return sessionAuthorizes(request, actor);
  if (!publicationMessageIsRecent(messagePayload.issuedAt)) return false;
  try {
    return await verifyMessage({
      address: actor as `0x${string}`,
      message: publicationMessage(messagePayload),
      signature: signatureText as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json({ error: "Invalid publication request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid publication request" }, { status: 400 });
  }
  const input = parsed.data;
  if (
    (input.action === "register" || input.action === "prepare") &&
    typeof input.terms.creator === "string" &&
    input.terms.creator.toLowerCase() !== input.actor.toLowerCase()
  ) {
    return NextResponse.json({ error: "Actor must be the campaign creator" }, { status: 400 });
  }
  if (
    input.action === "register" &&
    input.swarmReference &&
    (typeof input.terms.pitchReference !== "string" ||
      input.terms.pitchReference.toLowerCase() !== input.swarmReference.toLowerCase())
  ) {
    return NextResponse.json({ error: "Swarm reference must match the Arc pitch commitment" }, { status: 400 });
  }
  if (!(await authorize(request, input as unknown as Record<string, unknown>))) {
    return unauthorized();
  }

  try {
    if (input.action === "prepare") {
      const { bytes } = encodePitch(input.manifest);
      const manifest = JSON.parse(bytes.toString("utf8"));
      if (manifest.creator.toLowerCase() !== input.actor.toLowerCase() || !(await referenceMatches(bytes, input.terms.pitchReference))) {
        return NextResponse.json({ error: "Pitch bytes and creator must match the intended Arc commitment" }, { status: 400 });
      }
      const requestDigest = publicationDigest({ actor: input.actor.toLowerCase(), arcChainId: input.arcChainId, terms: input.terms });
      const outcome = await runPublication(createWorkflowStore(), {
        swarm: { upload: () => uploadPublicBytes(bytes) },
        arc: { confirm: async () => ({ status: "pending" }) },
      }, { id: randomUUID(), actor: input.actor, arcChainId: input.arcChainId, requestDigest,
        termsJson: JSON.stringify(input.terms), payload: input.manifest });
      return NextResponse.json(serialize(outcome.operation, outcome.nextStep, outcome.retryable), { status: 202 });
    }
    if (input.action === "swarm") {
      const { bytes: manifest } = encodePitch({ title: input.title, synopsis: input.synopsis,
        posterRef: input.posterRef, genre: input.genre, creator: input.actor, rightsNotice: input.rightsNotice });
      const reference = (await uploadPublicBytes(manifest)).replace(/^0x/i, "");
      if (!/^[0-9a-fA-F]{64}$/.test(reference)) {
        throw new Error("Swarm returned an invalid pitch reference");
      }
      return NextResponse.json({ swarmReference: `0x${reference.toLowerCase()}` });
    }

    const store = createWorkflowStore();
    if (input.action === "register") {
      const requestDigest = publicationDigest({
        actor: input.actor.toLowerCase(),
        arcChainId: input.arcChainId,
        terms: input.terms,
      });
      const operation = await recordArcTransaction(store, {
        id: randomUUID(),
        actor: input.actor,
        arcChainId: input.arcChainId,
        requestDigest,
        arcTxHash: input.arcTxHash,
        swarmReference: input.swarmReference,
        termsJson: JSON.stringify(input.terms),
      });
      return NextResponse.json(serialize(operation), { status: 202 });
    }

    if (input.action === "reconcile") {
      const current = await findPublication(store, input.actor, input.digest);
      if (!current) {
        return NextResponse.json({ error: "Publication not found" }, { status: 404 });
      }
      const intended = current.termsJson ? safeTerms(current.termsJson) : null;
      const outcome = await runPublication(
        store,
        {
          arc: {
            confirm: createArcConfirmation({
              expectedTerms: intended,
            }),
          },
          arkiv: {
            find: async (operation) => {
              if (!operation.campaignAddress) return null;
              return findOwnedFilmEntity({
                actor: operation.actor,
                campaignAddress: operation.campaignAddress as `0x${string}`,
                requestDigest: operation.requestDigest,
                entityId: operation.arkivEntityId ?? undefined,
              });
            },
          },
        },
        {
          id: randomUUID(),
          actor: input.actor,
          arcChainId: ARC_TESTNET.id,
          requestDigest: input.digest,
        },
      );
      return NextResponse.json(serialize(outcome.operation, outcome.nextStep, outcome.retryable));
    }

    const current = await findPublication(store, input.actor, input.digest);
    if (!current?.campaignAddress) {
      return NextResponse.json(
        { error: "Campaign is not confirmed yet" },
        { status: 409 },
      );
    }
    if (current.status === "published") {
      return NextResponse.json(serialize(current, "complete", false));
    }
    const campaignAddress = current.campaignAddress as `0x${string}`;
    let operation = current;
    if (input.arkivTxHash || input.entityId) {
      // Journal wallet-returned Arkiv identifiers before querying the index for the entity.
      operation = await recordArkivTransaction(store, {
        actor: input.actor,
        requestDigest: input.digest,
        arkivTxHash: input.arkivTxHash ?? current.arkivTxHash,
        arkivEntityId: input.entityId ?? null,
      });
    }

    // Query by owner, campaign and digest even when the wallet response was lost before its
    // entity key reached local storage. Provider errors propagate so they cannot authorize a
    // duplicate createEntity call.
    const existing = await findOwnedFilmEntity({
      actor: operation.actor,
      campaignAddress,
      requestDigest: operation.requestDigest,
      entityId: input.entityId ?? operation.arkivEntityId ?? undefined,
    });
    if (existing) {
      const outcome = await runPublication(
        store,
        {
          arc: { confirm: async () => ({ status: "pending" }) },
          arkiv: { find: () => Promise.resolve(existing) },
        },
        {
          id: randomUUID(),
          actor: input.actor,
          arcChainId: ARC_TESTNET.id,
          requestDigest: input.digest,
        },
      );
      return NextResponse.json(serialize(outcome.operation, outcome.nextStep, outcome.retryable));
    }
    if (
      input.retry &&
      operation.status === "publishing" &&
      !operation.arkivTxHash &&
      !operation.arkivEntityId
    ) {
      // No entity was found above and no transaction is journalled. After the index delay the
      // creator may try again; a duplicate listing would share this digest and is deduplicated.
      if (Date.now() - operation.updatedAt.getTime() < UNSENT_RETRY_AFTER_MS) {
        return NextResponse.json(
          { error: "An earlier listing attempt may still be indexing. Try again in a couple of minutes." },
          { status: 409 },
        );
      }
      await resetUnsentArkivPublication(store, input.actor, input.digest);
      operation = await beginArkivPublication(store, input.actor, input.digest);
      return NextResponse.json(
        {
          error: "The earlier attempt produced no listing; the connected creator may publish it",
          authorized: true,
          operation: serialize(operation),
        },
        { status: 409 },
      );
    }
    if (operation.arkivTxHash || operation.arkivEntityId) {
      if (
        operation.arkivTxHash &&
        (await getArkivReceiptStatus(operation.arkivTxHash)) === "failed"
      ) {
        operation = await retryFailedArkivPublication(
          store,
          input.actor,
          input.digest,
          operation.arkivTxHash,
        );
        operation = await beginArkivPublication(store, input.actor, input.digest);
        return NextResponse.json(
          {
            error: "The previous Arkiv transaction reverted; its listing may be retried",
            authorized: true,
            operation: serialize(operation),
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        serialize(operation, "arkiv-publication", true),
        { status: 202 },
      );
    }
    if (operation.status === "publishing") {
      // A missing response and delayed index cannot prove that no wallet transaction was sent.
      // Keep the write uncertain until a stored receipt proves failure or its entity is found.
      return NextResponse.json(serialize(operation, "arkiv-publication", true), { status: 202 });
    }
    if (operation.status === "confirmed") {
      operation = await beginArkivPublication(store, input.actor, input.digest);
      return NextResponse.json(
        {
          error: "No matching Arkiv entity exists yet; the connected creator may publish it",
          authorized: true,
          operation: serialize(operation),
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        operation: serialize(operation),
      },
      { status: 409 },
    );
  } catch (error) {
    if (
      error instanceof PublicationConflictError ||
      error instanceof PublicationStateError
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Publication journal is unavailable. Try again." },
      { status: 503 },
    );
  }
}

function safeTerms(termsJson: string) {
  try {
    const parsed = JSON.parse(termsJson);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const actor = params.get("actor");
  const requestDigest = params.get("digest");
  if (
    !actor ||
    !/^0x[0-9a-fA-F]{40}$/.test(actor) ||
    !requestDigest ||
    !/^[0-9a-f]{64}$/.test(requestDigest)
  ) {
    return NextResponse.json({ error: "Invalid publication query" }, { status: 400 });
  }
  try {
    const operation = await findPublication(
      createWorkflowStore(),
      actor,
      requestDigest,
    );
    if (!operation) {
      return NextResponse.json({ error: "Publication not found" }, { status: 404 });
    }
    return NextResponse.json(serialize(operation));
  } catch {
    return NextResponse.json(
      { error: "Publication journal is unavailable. Try again." },
      { status: 503 },
    );
  }
}
