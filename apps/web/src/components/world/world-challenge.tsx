"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { IDKitRequestWidget, proofOfHuman, type RpContext } from "@worldcoin/idkit";
import { WalletConnect } from "@/components/wallet/wallet-connect";
import { useSession } from "@/lib/use-session";
import { ARC_TESTNET } from "@/lib/chain";

type Challenge = {
  appId: `app_${string}`; action: string; signal: string; token: string;
  wallet: string; environment: "staging" | "production"; rp_context: RpContext;
};

/** Standalone proof setup page; proof collection never unlocks the contribution UI. */
export function WorldChallenge({ campaign }: { campaign: string }) {
  const session = useSession();
  const { address } = useAccount();
  const [challenge, setChallenge] = useState<Challenge>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function start() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/world/challenge", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ arcChainId: String(ARC_TESTNET.id), campaignAddress: campaign }) });
      if (!response.ok) throw new Error("World challenge unavailable. Check server configuration and sign in again.");
      setChallenge(await response.json() as Challenge);
      setOpen(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start World ID."); }
    finally { setBusy(false); }
  }
  const current = session.active && challenge?.wallet === address?.toLowerCase();
  return <section className="mx-auto max-w-xl space-y-5 p-6">
    <h1 className="text-2xl font-bold">World ID campaign challenge</h1>
    <p>Campaign: {campaign}</p>
    <p>Proof setup only. Funding remains locked until server verification and contract authorization are implemented.</p>
    <WalletConnect />
    {!session.active ? <button disabled={session.busy || !address} onClick={() => void session.signIn()}>Sign in with wallet</button>
      : <button disabled={busy} onClick={() => void start()}>{busy ? "Preparing…" : "Open World ID"}</button>}
    {session.error && <p role="alert">{session.error}</p>}
    {message && <p role="status">{message}</p>}
    {challenge && current && <IDKitRequestWidget key={challenge.token} open={open} onOpenChange={setOpen}
      app_id={challenge.appId} action={challenge.action} rp_context={challenge.rp_context}
      environment={challenge.environment} allow_legacy_proofs={false} preset={proofOfHuman({ signal: challenge.signal })}
      handleVerify={async (proof) => {
        const response = await fetch("/api/world/context", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: challenge.token, proof }) });
        if (!response.ok) throw new Error("Proof context rejected; request a fresh challenge.");
        setMessage("Proof context matches. Cryptographic verification is pending P9.4; no funding authorization issued.");
        setOpen(false);
        throw new Error("Proof acceptance is not enabled yet.");
      }}
      onSuccess={() => setMessage("No funding authorization issued.")}
      onError={() => setMessage((previous) => previous || "World ID did not complete. Request a fresh challenge and try again.")} />}
  </section>;
}
