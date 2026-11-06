"use client";

import { useWalletSupport } from "@/lib/wallet-policy";

/** Renders the wallet-policy notice wherever WalletConnect is mounted. */
export function WalletSupportNotice() {
  const support = useWalletSupport();
  if (!support.notice) return null;
  return (
    <p role="status" className="mt-2 text-xs leading-[1.6] text-amber-300">
      {support.notice}
    </p>
  );
}
