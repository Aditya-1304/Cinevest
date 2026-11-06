import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyWalletRequest } from "@/lib/wallet-auth";
import { readJson } from "@/lib/http";
import { uploadPublicBytes } from "@/lib/swarm/bee";
import { encodePitch } from "@/lib/swarm/pitch";
import { encodeMilestone } from "@/lib/swarm/milestone";
import { MAX_POSTER_BYTES, pitchInputSchema, SAFE_IMAGE_TYPES } from "@/lib/swarm/artifact-validation";
import { queryFilmDetail } from "@/lib/arkiv/film-detail";
import { ARC_TESTNET } from "@cinevest/abi";

const schema = z.object({
  action: z.literal("artifact-upload"), actor: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  kind: z.enum(["poster", "pitch", "milestone"]),
  payload: z.unknown(), issuedAt: z.number().int(), signature: z.string().optional(),
}).strict();

/** Upload only signed, explicitly public artifacts. Film video never passes through this endpoint. */
export async function POST(request: NextRequest) {
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await readJson(request, 7 * 1024 * 1024)); }
  catch { return NextResponse.json({ error: "Invalid artifact request" }, { status: 400 }); }
  if (!(await verifyWalletRequest(input, request))) return NextResponse.json({ error: "Creator sign-in required" }, { status: 401 });
  let bytes: Uint8Array;
  try {
    if (input.kind === "pitch") {
      const pitch = pitchInputSchema.parse(input.payload);
      if (pitch.creator.toLowerCase() !== input.actor.toLowerCase()) throw new Error("Creator mismatch");
      bytes = encodePitch(pitch).bytes;
    } else if (input.kind === "milestone") {
      bytes = encodeMilestone(input.payload);
      const manifest = JSON.parse(Buffer.from(bytes).toString("utf8"));
      const film = await queryFilmDetail(ARC_TESTNET.id, manifest.campaignAddress);
      if (String(film.terms.creator).toLowerCase() !== input.actor.toLowerCase() || film.stage !== 2) {
        return NextResponse.json({ error: "Only the campaign creator may upload production evidence" }, { status: 403 });
      }
    } else {
      const poster = z.object({ contentType: z.enum(SAFE_IMAGE_TYPES), base64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict().parse(input.payload);
      bytes = Buffer.from(poster.base64, "base64");
      if (!bytes.length || bytes.length > MAX_POSTER_BYTES) throw new Error("Invalid poster size");
      const header = Buffer.from(bytes.slice(0, 12));
      const detected = header.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? "image/png"
        : header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff ? "image/jpeg"
        : /^GIF8[79]a/.test(header.toString("ascii")) ? "image/gif"
        : header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
      if (poster.contentType !== detected) throw new Error("Poster bytes do not match its image type");
    }
  } catch { return NextResponse.json({ error: "Invalid public artifact or unavailable campaign" }, { status: 422 }); }
  try {
    const reference = await uploadPublicBytes(bytes);
    return NextResponse.json({ reference: `0x${reference.replace(/^0x/i, "").toLowerCase()}` });
  } catch { return NextResponse.json({ status: "artifact-unavailable", retryable: true }, { status: 503 }); }
}
