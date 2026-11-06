import { createHash } from "node:crypto";
import { pitchInputSchema } from "./artifact-validation";

export function encodePitch(input: unknown) {
  const pitch = pitchInputSchema.parse(input);
  const manifest = {
    schema: "Cinevest.pitch.v1",
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
