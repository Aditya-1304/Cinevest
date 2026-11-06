"use client";

import { useSyncExternalStore } from "react";
import {
  useAccount,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { ARC_TESTNET } from "@/lib/chain";
import { cn } from "@/lib/utils";
import { WalletSupportNotice } from "./wallet-support";

const subscribe = () => () => {};

export function WalletConnect() {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const connection = useAccount();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();

  if (!mounted || connection.status === "reconnecting")
    return <p className="text-sm text-white/70">Checking wallet connection…</p>;

  if (!connection.isConnected) {
    return (
      <div>
        <p className="text-sm text-white/70">
          Connect a wallet to use Arc Testnet.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {connectors.map((connector) => (
            <button
              type="button"
              className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-white/15 bg-[#072733] px-[18px] text-[11px] font-bold text-white transition hover:border-[#d3ed05]/50"
              key={connector.uid}
              disabled={connect.isPending}
              onClick={() => connect.connect({ connector })}
            >
              {connect.isPending ? "Connecting…" : `Connect ${connector.name}`}
            </button>
          ))}
        </div>
        {connect.error && (
          <p role="alert" className="mt-2 text-sm text-red-300">
            Could not connect wallet. Check your wallet and try again.
          </p>
        )}
        <WalletSupportNotice />
      </div>
    );
  }

  const wrongNetwork = connection.chainId !== ARC_TESTNET.id;
  return (
    <div>
      <p className="text-sm text-white/70">
        Wallet: {connection.address.slice(0, 6)}…{connection.address.slice(-4)}
      </p>
      <p className={cn("text-sm", wrongNetwork ? "text-amber-300" : "text-white/70")}>
        {wrongNetwork
          ? "Wrong network. Switch to Arc Testnet to continue."
          : "Connected to Arc Testnet."}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {wrongNetwork && (
          <button
            type="button"
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[#d3ed05] px-[18px] text-[13px] font-bold text-black transition hover:bg-[#e4ff1a]"
            disabled={switchChain.isPending}
            onClick={() => switchChain.switchChain({ chainId: ARC_TESTNET.id })}
          >
            {switchChain.isPending ? "Switching…" : "Switch to Arc Testnet"}
          </button>
        )}
        <button
          type="button"
          className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-white/15 bg-[#072733] px-[18px] text-[11px] font-bold text-white transition hover:border-[#d3ed05]/50"
          onClick={() => disconnect.disconnect()}
        >
          Disconnect
        </button>
      </div>
      {switchChain.error && wrongNetwork && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          Could not switch networks. Switch to Arc Testnet in your wallet and
          try again.
        </p>
      )}
      <WalletSupportNotice />
    </div>
  );
}
