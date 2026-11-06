"use client";

/**
 * Posts to a creator-authorized backend endpoint using the SIWE session cookie, signing in once
 * (one wallet prompt, valid for hours) instead of signing every request. A 401 triggers one
 * re-sign-in and retry, so an expired session never strands a flow.
 */
import { useCallback } from "react";
import { useAccount } from "wagmi";
import { signedPost, type JournalResponse } from "@/lib/publication-client";
import { useSession } from "@/lib/use-session";

export class SignInRequiredError extends Error {
  constructor() {
    super("Sign-in is required to continue. Approve the sign-in request in your wallet.");
  }
}

export function useAuthedPost() {
  const { address } = useAccount();
  const session = useSession();
  const { signIn } = session;

  const sessionLive = useCallback(async () => {
    if (!address) return false;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      return response.ok && ((await response.json()) as { address: string }).address === address.toLowerCase();
    } catch {
      return false;
    }
  }, [address]);

  const ensureSession = useCallback(async () => {
    if (await sessionLive()) return;
    await signIn();
    if (!(await sessionLive())) throw new SignInRequiredError();
  }, [sessionLive, signIn]);

  const post = useCallback(
    async <T = Record<string, unknown>>(
      path: "/api/publications" | "/api/artifacts" | "/api/listings/extend",
      payload: Record<string, unknown>,
    ): Promise<JournalResponse<T>> => {
      await ensureSession();
      const result = await signedPost<T>(path, payload, null);
      if (result.status !== 401) return result;
      await signIn();
      if (!(await sessionLive())) throw new SignInRequiredError();
      return signedPost<T>(path, payload, null);
    },
    [ensureSession, sessionLive, signIn],
  );

  return { post, ensureSession };
}
