/** Bound untrusted JSON before parsing so oversized artifacts cannot exhaust the API process. */
export async function readJson(request: Request, limit = 256 * 1024): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > limit) throw new Error("Request too large");
  if (!request.body) throw new Error("Request body required");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) { await reader.cancel(); throw new Error("Request too large"); }
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
