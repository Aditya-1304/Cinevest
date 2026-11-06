"use client";

import { useEffect, useState } from "react";
import { ARC_TESTNET } from "@/lib/chain";

/**
 * Shortened address with a copy button and Arc explorer link, shared by the
 * campaign reads on the film page.
 */
export function AddressLink({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <a
        className="break-all font-semibold underline decoration-white/40 hover:text-[#e4ff1a]"
        href={`${ARC_TESTNET.blockExplorers.default.url}/address/${address}`}
        target="_blank"
        rel="noreferrer"
      >
        {short}
      </a>
      <button
        type="button"
        className="text-[10px] font-bold text-white/50 transition hover:text-[#d3ed05]"
        aria-label={copied ? `Address ${short} copied` : `Copy address ${short}`}
        onClick={() => {
          navigator.clipboard
            ?.writeText(address)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
