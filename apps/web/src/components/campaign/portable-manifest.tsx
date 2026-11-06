"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inspectPublicFilm } from "../../../../backend/lib/public/consistency";

type Inspection = Awaited<ReturnType<typeof inspectPublicFilm>>;

/** Reads committed artifacts through public providers; no Cinevest API or session participates. */
export function PortableManifest({ entityId }: { entityId: string }) {
  const [gateway, setGateway] = useState("");
  const [result, setResult] = useState<Inspection>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    setBusy(true); setFailed(false); setResult(undefined);
    try { setResult(await inspectPublicFilm(entityId, { gateway })); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "cinevest-public-consistency.json"; link.click();
    URL.revokeObjectURL(url);
  }

  const button = "inline-flex h-8 items-center rounded-lg border border-white/15 bg-[#072733] px-3 text-xs font-bold text-white transition hover:border-[#d3ed05]/50 disabled:opacity-50";
  return (
    <section className="mt-3 space-y-3 border-t border-white/10 pt-3 text-sm text-white/80 [&_p]:text-xs">
      <div className="grid gap-1.5">
        <Label htmlFor={`gateway-${entityId}`}>Public Swarm gateway</Label>
        <Input
          id={`gateway-${entityId}`}
          type="url"
          placeholder="https://your-public-gateway"
          value={gateway}
          onChange={(event) => setGateway(event.target.value)}
        />
      </div>
      <button type="button" className={button} disabled={busy || !gateway} onClick={() => void load()}>
        {busy ? "Checking public sources…" : "Read pitch and milestones"}
      </button>
      {failed && (
        <p role="alert" className="text-red-300">
          Public verification failed. Check provider availability, listing ownership, and campaign registration.
        </p>
      )}
      {result && (
        <div className="space-y-3">
          <p className={result.report.consistent ? "text-[#d3ed05]" : "text-amber-300"}>
            {result.report.consistent ? "Public commitments match." : "Public data is incomplete or inconsistent."}
          </p>
          {result.pitch ? (
            <article className="space-y-2">
              <h3 className="font-bold text-white">{result.pitch.title}</h3>
              <p className="line-clamp-6 whitespace-pre-wrap break-words">{result.pitch.synopsis}</p>
              <p className="line-clamp-3 whitespace-pre-wrap break-words text-white/50">{result.pitch.rightsNotice}</p>
            </article>
          ) : (
            <p>Pitch: {result.report.swarm.pitch.status}</p>
          )}
          {result.milestones.map((item) => (
            <article key={item.index} className="space-y-1 rounded-lg border border-white/10 p-3">
              <h3 className="font-bold text-white">Milestone {item.index}: {item.check.status}</h3>
              {item.manifest && (
                <>
                  <p className="whitespace-pre-wrap break-words">{item.manifest.text}</p>
                  <p>Submitted (Unix seconds): {item.manifest.submittedAt}</p>
                  <ul className="space-y-1">
                    {item.manifest.evidenceFiles.map((reference) => (
                      <li className="text-xs break-all text-white/60" key={reference}>Evidence reference: {reference}</li>
                    ))}
                  </ul>
                </>
              )}
            </article>
          ))}
          <p className="text-white/50">Media readiness and signed playback policy cannot be verified from the public commitment alone.</p>
          <button type="button" className={button} onClick={download}>Export public consistency report</button>
        </div>
      )}
    </section>
  );
}
