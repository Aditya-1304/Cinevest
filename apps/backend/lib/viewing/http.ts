import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { readJson } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { arcChainId, campaignAddress } from "@/lib/media/input";
import { ViewingDenied, type ViewingKey } from "./service";

export const headers = { "cache-control": "no-store" };
export const filmInput = { arcChainId, campaignAddress };
const seconds = z.number().min(0).max(24 * 60 * 60);
export const playInput = {
  positionSeconds: seconds,
  played: z.array(z.tuple([seconds, seconds])).max(256),
};

export function viewingFailure(error: unknown) {
  if (error instanceof ViewingDenied) return NextResponse.json({ error: error.code }, { status: error.status, headers });
  logEvent("warn", "viewing.request_failed", { error: error instanceof Error ? error.message : String(error) });
  return NextResponse.json({ error: "viewing_unavailable", retryable: true }, { status: 503, headers });
}

/** Shared POST boundary: the wallet comes only from the SIWE session, never from the body. */
export async function viewingPost<T extends z.ZodRawShape>(
  request: Request, shape: T,
  run: (key: ViewingKey, input: z.infer<z.ZodObject<T>>) => Promise<unknown>,
) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  let input: z.infer<z.ZodObject<T>>;
  try { input = z.object({ ...filmInput, ...shape }).strict().parse(await readJson(request, 32 * 1024)) as z.infer<z.ZodObject<T>>; }
  catch { return NextResponse.json({ error: "invalid_request" }, { status: 400, headers }); }
  const { arcChainId, campaignAddress } = input as unknown as { arcChainId: string; campaignAddress: `0x${string}` };
  try {
    return NextResponse.json(await run({ arcChainId, campaign: campaignAddress, wallet: session.address as `0x${string}` }, input), { headers });
  } catch (error) { return viewingFailure(error); }
}

