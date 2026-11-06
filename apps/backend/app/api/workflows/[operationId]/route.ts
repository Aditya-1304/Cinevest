import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createDatabase } from "@/lib/db";
import { workflowOperations } from "@/lib/db/schema";
import { verifyWalletRequest } from "@/lib/wallet-auth";

/** Creator-signed recovery lookup; SIWE session support is added with the Phase 8 auth boundary. */
export async function GET(request: NextRequest, context: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await context.params;
  const actor = request.nextUrl.searchParams.get("actor") ?? "";
  const issuedAt = Number(request.nextUrl.searchParams.get("issuedAt"));
  const signature = request.nextUrl.searchParams.get("signature");
  if (!/^[0-9a-f-]{36}$/i.test(operationId) || !/^0x[0-9a-fA-F]{40}$/.test(actor)) return NextResponse.json({ error: "Invalid workflow identity" }, { status: 400 });
  if (!(await verifyWalletRequest({ action: "workflow-read", operationId, actor, issuedAt, signature }))) return NextResponse.json({ error: "Creator signature required" }, { status: 401 });
  try {
    const [operation] = await createDatabase().select().from(workflowOperations).where(and(eq(workflowOperations.id, operationId), eq(workflowOperations.actor, actor.toLowerCase()))).limit(1);
    if (!operation) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    return NextResponse.json({ id: operation.id, actor: operation.actor, arcChainId: operation.arcChainId, campaignAddress: operation.campaignAddress,
      swarmReference: operation.swarmReference, arcTxHash: operation.arcTxHash, arkivTxHash: operation.arkivTxHash,
      arkivEntityId: operation.arkivEntityId, status: operation.status, retryCount: operation.retryCount }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Workflow lookup unavailable", retryable: true }, { status: 503 }); }
}
