import { NextRequest, NextResponse } from "next/server";
import { queryFilms } from "@/lib/arkiv/query-films";
import { InvalidCursorError } from "@/lib/arkiv/discovery";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const genre = params.get("genre") || undefined;
  const deadlineText = params.get("deadline");
  const cursor = params.get("cursor") ?? undefined;
  const owner = params.get("owner") ?? undefined;
  if (
    (genre && Buffer.byteLength(genre, "utf8") > 128) ||
    (deadlineText !== null && !/^\d{1,19}$/.test(deadlineText)) ||
    (cursor !== undefined && cursor.length > 32768) ||
    (owner !== undefined && !/^0x[0-9a-fA-F]{40}$/.test(owner))
  ) {
    return NextResponse.json(
      { error: "Invalid discovery filters" },
      { status: 400 },
    );
  }
  try {
    const result = await queryFilms({
      genre,
      deadline: deadlineText === null ? undefined : BigInt(deadlineText),
      cursor,
      owner: owner as `0x${string}` | undefined,
    });
    return NextResponse.json({
      films: result.entities.map(({ entity, stage, raised, sourceBlock, stale }) => ({
        key: entity.$key,
        entityId: entity.$key,
        arcChainId: entity.arcChainId.value.toString(),
        campaignAddress: entity.campaignAddress.value,
        creatorAddress: entity.creatorAddress.value,
        owner: entity.$owner,
        genre: entity.genre.value,
        title: entity.title.value,
        fundingDeadline: entity.fundingDeadline.value.toString(),
        pitchSwarmRef: entity.pitchSwarmRef.value,
        posterSwarmRef: entity.posterSwarmRef.value,
        expiresAtBlock: entity.$expiresAt?.toString() ?? null,
        stage,
        raised: raised?.toString() ?? null,
        sourceBlock,
        stale,
      })),
      nextCursor: result.nextCursor,
      status: result.status,
      retryable: result.retryable,
      completeness: result.completeness,
      excluded: result.excluded,
      excludedReasons: result.excludedReasons,
      temporarilyUnverifiable: result.temporarilyUnverifiable,
      verificationStatus: result.verificationStatus,
      scanned: result.scanned,
      pages: result.pages,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Discovery is unavailable. Try again." },
      { status: 503 },
    );
  }
}
