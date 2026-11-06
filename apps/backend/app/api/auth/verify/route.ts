import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson } from "@/lib/http";
import { verifySiwe } from "@/lib/auth/siwe-verify";

const bodySchema = z.object({ message: z.string().min(1).max(8192), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(2048) }).strict();

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(request, 12 * 1024));
  } catch {
    return NextResponse.json({ error: "Invalid authentication request" }, { status: 400 });
  }
  const result = await verifySiwe(body);
  if (!result) return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
