"use client";

/**
 * Wallet support policy for the app. Arc Testnet only for now (Arkiv arrives in
 * Phase 7): EOA browser wallets are fully supported; contract/smart-account
 * wallets may transact on Arc but are flagged for the Arkiv limitation; without
 * an injected wallet the user is pointed at an install; any other state fails
 * through the existing switch/connect flows before anything is signed.
 */
import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { ARC_TESTNET } from "@/lib/chain";

export type WalletSupport =
  | { kind: "unconnected"; notice?: string }
  | { kind: "install"; notice: string }
  | { kind: "wrong-network"; notice: string }
  | { kind: "contract"; notice: string }
  | { kind: "eoa"; notice?: string };

type EthereumWindow = { ethereum?: unknown };

export function useWalletSupport(): WalletSupport {
  const { address, chainId, isConnected } = useAccount();
  const client = usePublicClient({ chainId: ARC_TESTNET.id });
  const [hasInjected, setHasInjected] = useState<boolean | null>(null);
  const [isContract, setIsContract] = useState<boolean | null>(null);

  useEffect(() => {
    setHasInjected(!!(globalThis as EthereumWindow).ethereum);
  }, []);

  // EOA vs contract wallet detection via empty-code check (EIP-1271/smart accounts have code).
  useEffect(() => {
    if (!isConnected || !address || chainId !== ARC_TESTNET.id || !client) {
      setIsContract(null);
      return;
    }
    let active = true;
    client
      .getCode({ address })
      .then((code) => {
        // viem returns undefined (not "0x") for an account without code.
        if (active) setIsContract(!!code && code !== "0x");
      })
      .catch(() => {
        if (active) setIsContract(null);
      });
    return () => {
      active = false;
    };
  }, [address, chainId, client, isConnected]);

  if (!isConnected) {
    if (hasInjected === false)
      return {
        kind: "install",
        notice:
          "No browser wallet detected. Install a browser wallet such as MetaMask or Rabby to use Cinevest.",
      };
    return { kind: "unconnected" };
  }
  if (chainId !== ARC_TESTNET.id)
    return {
      kind: "wrong-network",
      notice: "Cinevest supports Arc Testnet only. Switch to Arc Testnet to continue.",
    };
  if (isContract)
    return {
      kind: "contract",
      notice:
        "This is a smart-contract wallet. It can sign Arc Testnet transactions, but it is not supported for creator-owned Arkiv listings yet.",
    };
  return { kind: "eoa" };
}
