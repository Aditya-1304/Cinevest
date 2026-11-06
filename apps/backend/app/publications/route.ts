import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyMessage } from "viem";
import { ARC_TESTNET } from "@reelance/abi";
import { createWorkflowStore } from "@/lib/workflows/store";
import { createArcConfirmation } from "@/lib/workflows/arc-adapter";
import { findOwnedFilmEntity } from "@/lib/arkiv/verify-entity";
import { uploadPublicBytes } from "@/lib/swarm/bee";
import { getArkivReceiptStatus } from "@/lib/workflows/arkiv-adapter";
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
  retryArkivPublication,
  retryFailedArkivPublication,
  runPublication,
  type PublicationStep,
  type WorkflowOperation,
} from "@/lib/workflows/publication";

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const issuedAt = z.int().positive();
const signature = z.string().regex(/^0x[0-9a-fA-F]+$/);
const ARKIV_RECONCILE_GRACE_MS = 60_000;
const terms = z
  .record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  )
  .refine((value) => Object.keys(value).length > 0);

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("swarm"),
    actor: address,
    title: z.string().min(1).max(256),
    genre: z.string().min(1).max(128),
    pitch: z.string().min(1).max(16_384),
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
    issuedAt,
    signature,
  }),
]);

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
async function authorize(payload: Record<string, unknown>) {
  const { signature: signatureText, ...messagePayload } = payload;
  if (!publicationMessageIsRecent(messagePayload.issuedAt)) return false;
  const actor = messagePayload.actor;
  if (typeof actor !== "string" || !address.safeParse(actor).success) return false;
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
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid publication request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid publication request" }, { status: 400 });
  }
  const input = parsed.data;
  if (
    input.action === "register" &&
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
  if (!(await authorize(input as unknown as Record<string, unknown>))) {
    return unauthorized();
  }

  try {
    if (input.action === "swarm") {
      const manifest = Buffer.from(
        JSON.stringify({
          schema: "clipstake.pitch.v1",
          manifestVersion: 1,
          title: input.title,
          genre: input.genre,
          pitch: input.pitch,
        }),
        "utf8",
      );
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
      if (Date.now() - operation.updatedAt.getTime() < ARKIV_RECONCILE_GRACE_MS) {
        return NextResponse.json(
          serialize(operation, "arkiv-publication", true),
          { status: 202 },
        );
      }
      operation = await retryArkivPublication(store, input.actor, input.digest);
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
