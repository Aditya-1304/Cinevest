import "server-only";

import { SiweMessage } from "siwe";
import { verifyMessage } from "viem";
import { requireServerEnv } from "@/lib/env";
import { consumeNonce } from "@/lib/auth/siwe-nonce";

export async function verifySiwe({ message, signature }: { message: string; signature: string }) {
  try {
    const appUrl = new URL(requireServerEnv("APP_URL"));
    const siwe = new SiweMessage(message);
    const now = Date.now();
    const issuedAt = siwe.issuedAt ? Date.parse(siwe.issuedAt) : Number.NaN;
    const expiresAt = siwe.expirationTime ? Date.parse(siwe.expirationTime) : null;
    if (siwe.domain !== appUrl.host || new URL(siwe.uri).origin !== appUrl.origin ||
        siwe.chainId !== 5042002 || siwe.version !== "1" ||
        !Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > 5 * 60 * 1000 ||
        (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= now))) return null;
    // Contract-wallet (EIP-1271) signatures are unsupported and fail closed.
    if (!(await verifyMessage({ address: siwe.address as `0x${string}`, message: siwe.prepareMessage(), signature: signature as `0x${string}` })) ||
        !(await consumeNonce(siwe.nonce))) return null;
    return { address: siwe.address, chainId: siwe.chainId };
  } catch {
    return null;
  }
}
