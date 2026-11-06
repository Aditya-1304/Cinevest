import { createHash } from "node:crypto";
import { z } from "zod";

const pitchSchema = z
  .object({
    title: z.string().trim().min(1),
    synopsis: z.string().trim().min(1),
    posterRef: z.string().regex(/^[0-9a-fA-F]{64}$/),
    genre: z.string().trim().min(1),
    creator: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    rightsNotice: z.string().trim().min(1),
  })
  .strict();

export function encodePitch(input: unknown) {
  const pitch = pitchSchema.parse(input);
  const manifest = {
    schema: "clipstake.pitch.v1",
    title: pitch.title,
    synopsis: pitch.synopsis,
    posterRef: pitch.posterRef.toLowerCase(),
    genre: pitch.genre,
    creator: pitch.creator.toLowerCase(),
    rightsNotice: pitch.rightsNotice,
    manifestVersion: 1,
  };
  const bytes = Buffer.from(JSON.stringify(manifest), "utf8");
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
