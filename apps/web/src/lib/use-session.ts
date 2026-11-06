"use client";

/**
 * SIWE wallet session against the backend cookie session. The cookie is HttpOnly, so the UI only
 * learns the signed-in wallet from /api/auth/session; a session for a different wallet than the
 * connected one is treated as signed out.
 */
import { useCallback, useEffect, useState } from "react";
import { getAddress } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { ARC_TESTNET } from "@/lib/chain";

async function readSession() {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    return response.ok ? ((await response.json()) as { address: string }).address : null;
  } catch {
    return null;
  }
}

export function useSession() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [wallet, setWallet] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setWallet(await readSession());
    setChecked(true);
  }, []);
  useEffect(() => {
    let live = true;
    void readSession().then((address) => {
      if (live) { setWallet(address); setChecked(true); }
    });
    return () => { live = false; };
  }, []);

  const signIn = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError(undefined);
    try {
      const nonce = await fetch("/api/auth/nonce", { cache: "no-store" });
      if (!nonce.ok) throw new Error("Sign-in is temporarily unavailable. Try again.");
      const { nonce: value } = (await nonce.json()) as { nonce: string };
      const message = [
        `${window.location.host} wants you to sign in with your Ethereum account:`,
        getAddress(address),
        "",
        "Sign in to Cinevest to watch films you have purchased.",
        "",
        `URI: ${window.location.origin}`,
        "Version: 1",
        `Chain ID: ${ARC_TESTNET.id}`,
        `Nonce: ${value}`,
        `Issued At: ${new Date().toISOString()}`,
      ].join("\n");
      const signature = await signMessageAsync({ message });
      const verified = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!verified.ok) throw new Error("Sign-in was rejected. Try again.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.message.startsWith("Sign-in") ? cause.message : "Sign-in was cancelled or failed.");
    } finally {
      setBusy(false);
    }
  }, [address, refresh, signMessageAsync]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setWallet(null);
  }, []);

  return {
    active: Boolean(wallet && address && wallet === address.toLowerCase()),
    checked, busy, error, signIn, signOut, refresh,
  };
}
