"use client";

/** Per-campaign read hooks: factory registration, terms, stage, raised and per-wallet claimable receipts. */
import { useAccount, useBytecode, useReadContract } from "wagmi";
import { keccak256, zeroAddress, type Address } from "viem";
import { campaignAbi, campaignFactoryAbi } from "@cinevest/abi";
import { ARC_TESTNET, ARC_TESTNET_DEPLOYMENT } from "@/lib/chain";

const REFRESH = { refetchInterval: 15_000 } as const;

export function useCampaign(campaign: Address) {
  const { address, chainId } = useAccount();
  const factoryAddress = ARC_TESTNET_DEPLOYMENT.factoryAddress;
  const bytecode = useBytecode({ address: factoryAddress, chainId: ARC_TESTNET.id,
    query: { enabled: ARC_TESTNET_DEPLOYMENT.compatible, ...REFRESH } });
  const factory = ARC_TESTNET_DEPLOYMENT.compatible && Boolean(bytecode.data
    && keccak256(bytecode.data) === ARC_TESTNET_DEPLOYMENT.runtimeCodeHash);

  const registry = useReadContract({
    address: factoryAddress,
    abi: campaignFactoryAbi,
    functionName: "isCampaign",
    args: [campaign],
    chainId: ARC_TESTNET.id,
    query: { enabled: factory, ...REFRESH },
  });

  const terms = useReadContract({
    address: campaign,
    abi: campaignAbi,
    functionName: "getTerms",
    chainId: ARC_TESTNET.id,
    query: { enabled: factory, ...REFRESH },
  });

  const stage = useReadContract({
    address: campaign,
    abi: campaignAbi,
    functionName: "getStage",
    chainId: ARC_TESTNET.id,
    query: { enabled: factory, ...REFRESH },
  });

  const raised = useReadContract({
    address: campaign,
    abi: campaignAbi,
    functionName: "raised",
    chainId: ARC_TESTNET.id,
    query: { enabled: factory, ...REFRESH },
  });

  const claimable = useReadContract({
    address: campaign,
    abi: campaignAbi,
    functionName: "claimableFunder",
    args: [address ?? zeroAddress],
    chainId: ARC_TESTNET.id,
    query: { enabled: !!address, ...REFRESH },
  });

  return { factory, address, chainId, registry, terms, stage, claimable, raised };
}
