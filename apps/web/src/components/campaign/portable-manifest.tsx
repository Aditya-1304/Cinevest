"use client";

import { useState } from "react";
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

  return <section className="mt-4 space-y-3 border-t pt-3">
    <label className="block">Public Swarm gateway
      <input type="url" className="ml-2 rounded border p-2" placeholder="https://your-public-gateway"
        value={gateway} onChange={event => setGateway(event.target.value)} />
    </label>
    <button type="button" disabled={busy || !gateway} onClick={() => void load()}>{busy ? "Checking public sources…" : "Read pitch and milestones"}</button>
    {failed && <p role="alert">Public verification failed. Check provider availability, listing ownership, and campaign registration.</p>}
    {result && <>
      <p>{result.report.consistent ? "Public commitments match." : "Public data is incomplete or inconsistent."}</p>
      {result.pitch ? <article className="space-y-2">
        <h3 className="font-bold">{result.pitch.title}</h3>
        <p className="whitespace-pre-wrap">{result.pitch.synopsis}</p>
        <p className="whitespace-pre-wrap">{result.pitch.rightsNotice}</p>
      </article> : <p>Pitch: {result.report.swarm.pitch.status}</p>}
      {result.milestones.map(item => <article key={item.index}>
        <h3 className="font-bold">Milestone {item.index}: {item.check.status}</h3>
        {item.manifest && <>
          <p className="whitespace-pre-wrap">{item.manifest.text}</p>
          <p>Submitted (Unix seconds): {item.manifest.submittedAt}</p>
          <ul>{item.manifest.evidenceFiles.map(reference => <li className="break-all" key={reference}>Evidence reference: {reference}</li>)}</ul>
        </>}
      </article>)}
      <p>Media readiness and signed playback policy cannot be verified from the public commitment alone.</p>
      <button type="button" onClick={download}>Export public consistency report</button>
    </>}
  </section>;
}
