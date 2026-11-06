"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { IDKitRequestWidget, proofOfHuman, type RpContext } from "@worldcoin/idkit";
import type { Address } from "viem";
import type { WorldAuthorizationGrant } from "@cinevest/abi";
import { WalletConnect } from "@/components/wallet/wallet-connect";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/use-session";
import { ARC_TESTNET } from "@/lib/chain";

type Challenge = {
  appId: `app_${string}`; action: string; signal: string; token: string;
  wallet: string; environment: "staging" | "production"; rp_context: RpContext;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "World ID request failed. Try again.");
  return data;
}

/** Collect a proof, persist verification, then recover the same durable funding permission on retries. */
export function WorldChallenge({ campaign, onAuthorized, disabled = false, embedded = false }: {
  campaign: string; onAuthorized?: (grant: WorldAuthorizationGrant | undefined) => void; disabled?: boolean; embedded?: boolean;
}) {
  const session = useSession();
  const { address, chainId } = useAccount();
  const [challenge, setChallenge] = useState<Challenge>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [permission, setPermission] = useState<WorldAuthorizationGrant>();
  useEffect(() => {
    if (!permission) return;
    const timer = setTimeout(() => {
      setPermission(undefined);
      onAuthorized?.(undefined);
      setMessage("Funding permission expired. Verify again for a fresh permission.");
    }, Math.max(0, Number(permission.authorization.deadline) * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [permission, onAuthorized]);
  const current = session.active && challenge?.wallet === address?.toLowerCase();
  async function start() {
    setBusy(true);
    setMessage("");
    setPermission(undefined);
    onAuthorized?.(undefined);
    try {
      const result = await post<Challenge>("/api/world/challenge", { arcChainId: String(ARC_TESTNET.id), campaignAddress: campaign });
      setChallenge(result);
      setOpen(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start World ID."); }
    finally { setBusy(false); }
  }
  async function authorize(token: string) {
    const grant = await post<WorldAuthorizationGrant>("/api/world/authorize", { token });
    if (grant.chainId !== ARC_TESTNET.id || grant.authorization.wallet.toLowerCase() !== address?.toLowerCase()
        || grant.authorization.campaign.toLowerCase() !== campaign.toLowerCase()
        || BigInt(grant.authorization.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
      throw new Error("Permission expired or belongs to another wallet. Verify again.");
    }
    setPermission(grant);
    onAuthorized?.(grant);
    setMessage("Human verified. Funding permission is ready; confirm your contribution before it expires.");
  }
  async function retry() {
    if (!challenge || !current) return;
    setBusy(true);
    try { await authorize(challenge.token); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not recover funding permission."); }
    finally { setBusy(false); }
  }
  return <section className={embedded ? "space-y-3 rounded-lg border border-white/15 p-3" : "mx-auto max-w-xl space-y-5 p-6"}>
    <h2 className="font-bold">Verify with World ID</h2>
    {!embedded && <><p>Campaign: {campaign as Address}</p><WalletConnect /></>}
    <p className="text-sm">One human, one wallet per campaign. Verification is required before approving or sending funds.</p>
    {!session.active ? <Button disabled={session.busy || !address || disabled} onClick={() => void session.signIn()}>
      {session.busy ? "Signing in…" : "Sign in with wallet"}</Button>
      : <Button disabled={busy || disabled || chainId !== ARC_TESTNET.id} onClick={() => void start()}>
        {busy ? "Preparing…" : "Verify with World ID"}</Button>}
    {challenge && current && <Button variant="outline" disabled={busy || disabled} onClick={() => void retry()}>Recover funding permission</Button>}
    {session.error && <p role="alert">{session.error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {permission && current && <p className="text-xs">Permission expires at {new Date(Number(permission.authorization.deadline) * 1000).toLocaleTimeString()}.</p>}
    {challenge && current && <IDKitRequestWidget key={challenge.token} open={open && !disabled} onOpenChange={setOpen}
      app_id={challenge.appId} action={challenge.action} rp_context={challenge.rp_context}
      environment={challenge.environment} allow_legacy_proofs={false} preset={proofOfHuman({ signal: challenge.signal })}
      handleVerify={async (proof) => {
        setBusy(true);
        try {
          await post("/api/world/verify", { token: challenge.token, proof });
          await authorize(challenge.token);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Verification failed. Try recovering the permission or verify again.");
          throw error;
        } finally { setBusy(false); }
      }}
      onSuccess={() => setOpen(false)}
      onError={() => setMessage((previous) => previous || "World ID was denied or did not complete. You can verify again.")} />}
  </section>;
}
