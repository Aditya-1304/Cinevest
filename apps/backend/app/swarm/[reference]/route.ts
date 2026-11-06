import { NextRequest, NextResponse } from "next/server";
import { ArtifactInvalidError, fetchSwarmManifest, fetchSwarmPoster } from "@/lib/swarm/artifacts";
import { queryFilmDetail } from "@/lib/arkiv/film-detail";
import { ARC_TESTNET } from "@cinevest/abi";
import { normalizeSwarmReference } from "@/lib/arkiv/candidate-validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;
  const kind = request.nextUrl.searchParams.get("kind");
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(reference)) {
    return NextResponse.json({ error: "Invalid Swarm reference" }, { status: 400 });
  }
  if (kind !== "pitch" && kind !== "milestone" && kind !== "poster") {
    return NextResponse.json({ error: "Unsupported Swarm artifact kind" }, { status: 400 });
  }
  try {
    if (kind === "pitch" || kind === "milestone") {
      const campaign = request.nextUrl.searchParams.get("campaign") ?? undefined;
      const indexText = request.nextUrl.searchParams.get("index");
      const index = indexText === null ? undefined : Number(indexText);
      if (kind === "milestone" && (!campaign || !/^0x[0-9a-fA-F]{40}$/.test(campaign) || (index !== 1 && index !== 2))) {
        return NextResponse.json({ error: "Invalid milestone artifact identity" }, { status: 400 });
      }
      if (campaign) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(campaign)) return NextResponse.json({ error: "Invalid campaign" }, { status: 400 });
        const film = await queryFilmDetail(ARC_TESTNET.id, campaign as `0x${string}`);
        const commitment = kind === "pitch" ? film.terms.pitchReference : film.evidenceReferences[index! - 1];
        if (normalizeSwarmReference(commitment) !== normalizeSwarmReference(reference)) throw new ArtifactInvalidError("Artifact does not match the campaign's Arc commitment");
      }
      return NextResponse.json(await fetchSwarmManifest(reference, kind, campaign, index), {
        headers: { "cache-control": "no-store" },
      });
    }
    const poster = await fetchSwarmPoster(reference);
    return new NextResponse(poster.bytes, {
      headers: {
        "content-type": poster.contentType,
        "content-length": String(poster.bytes.byteLength),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Swarm artifact is unavailable";
    const invalid = error instanceof ArtifactInvalidError;
    return NextResponse.json({
      status: invalid ? "invalid-artifact" : "artifact-unavailable",
      retryable: !invalid,
      error: message,
    }, {
      status: invalid ? 422 : 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
