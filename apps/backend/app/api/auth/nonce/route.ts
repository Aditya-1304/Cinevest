import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/auth/siwe-nonce";

export async function GET() {
  try {
    return NextResponse.json(await issueNonce(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Authentication is temporarily unavailable" }, { status: 503 });
  }
}
