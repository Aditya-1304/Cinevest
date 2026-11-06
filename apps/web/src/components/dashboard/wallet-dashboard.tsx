"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { zeroAddress, type Abi, type Address } from "viem";
import {
  ARC_TESTNET,
  ARC_TESTNET_DEPLOYMENT,
  CAMPAIGN_STAGES,
  type CampaignTerms,
} from "@/lib/chain";
import { formatUsdc } from "@/lib/format";
import { campaignAbi, campaignFactoryAbi } from "@cinevest/abi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletConnect } from "@/components/wallet/wallet-connect";
import { stagePillClass } from "@/lib/stage-style";
import { filmPath } from "@/lib/paths";

const PAGE_SIZE = 20;
const BPS = 10_000n;
const RELEASED_STAGE = 3;
const REFUND_STAGES = new Set([1, 4]);

type Mode = "creator" | "backer";

type ContractRead = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  chainId: number;
};

type Match = {
  address: Address;
  terms?: CampaignTerms;
  contribution?: bigint;
};

type Row =
  | {
      mode: "creator";
      address: Address;
      terms: CampaignTerms;
      stage: number;
      raised: bigint;
      creatorAllocated: bigint;
      creatorClaimed: bigint;
      withdrawableTranche: bigint;
      paidTranche: bigint;
    }
  | {
      mode: "backer";
      address: Address;
      terms: CampaignTerms;
      stage: number;
      raised: bigint;
      funderAllocated: bigint;
      contribution: bigint;
      claimable: bigint;
      claimed: bigint;
      mature: boolean;
    };

function usdc(value: bigint) {
  return `${formatUsdc(value)} test USDC`;
}

function short(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function WalletDashboard({ mode }: { mode: Mode }) {
  const { address, chainId } = useAccount();
  const factory = ARC_TESTNET_DEPLOYMENT.factoryAddress;
  const onArc = chainId === ARC_TESTNET.id;
  const [page, setPage] = useState(0);

  const count = useReadContract({
    address: factory ?? undefined,
    abi: campaignFactoryAbi,
    functionName: "campaignCount",
    chainId: ARC_TESTNET.id,
    query: {
      enabled: !!factory && !!address && onArc,
      retry: 1,
      refetchInterval: 15_000,
    },
  });
  const total = count.data === undefined ? undefined : Number(count.data);
  const lastPage =
    total === undefined ? 0 : Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  const pageLength =
    total === undefined ? 0 : Math.max(0, Math.min(PAGE_SIZE, total - start));

  const pageCampaigns = useReadContracts({
    contracts: Array.from({ length: pageLength }, (_, index) => ({
      address: factory ?? zeroAddress,
      abi: campaignFactoryAbi,
      functionName: "campaignAt" as const,
      args: [BigInt(start + index)] as const,
      chainId: ARC_TESTNET.id,
    })),
    query: {
      enabled: !!factory && !!address && onArc && pageLength > 0,
      retry: 1,
      refetchInterval: 15_000,
    },
  });
  const addresses = useMemo(() => {
    const rows: Address[] = [];
    pageCampaigns.data?.forEach((read) => {
      if (read.status === "success") rows.push(read.result as Address);
    });
    return rows;
  }, [pageCampaigns.data]);

  const filterContracts: ContractRead[] =
    mode === "creator"
      ? addresses.map((campaign) => ({
          address: campaign,
          abi: campaignAbi,
          functionName: "getTerms" as const,
          chainId: ARC_TESTNET.id,
        }))
      : addresses.map((campaign) => ({
          address: campaign,
          abi: campaignAbi,
          functionName: "contribution" as const,
          args: [address ?? zeroAddress] as const,
          chainId: ARC_TESTNET.id,
        }));
  const filterReads = useReadContracts({
    contracts: filterContracts,
    query: {
      enabled: !!address && onArc && addresses.length > 0,
      retry: 1,
      refetchInterval: 15_000,
    },
  });
  const matches = useMemo<Match[]>(() => {
    if (!filterReads.data || !address) return [];
    const rows: Match[] = [];
    addresses.forEach((campaign, index) => {
      const read = filterReads.data[index];
      if (read?.status !== "success") return;
      if (mode === "creator") {
        const terms = read.result as unknown as CampaignTerms;
        if (terms.creator.toLowerCase() === address.toLowerCase())
          rows.push({ address: campaign, terms });
      } else {
        const contribution = read.result as unknown as bigint;
        if (contribution > 0n) rows.push({ address: campaign, contribution });
      }
    });
    return rows;
  }, [address, addresses, filterReads.data, mode]);

  const detailContracts: ContractRead[] = matches.flatMap(
    (match): ContractRead[] =>
      mode === "creator"
        ? [
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "getStage" as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "raised" as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "creatorAllocated" as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "creatorClaimed" as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "withdrawableTrancheAmount" as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "paidTrancheAmount" as const,
              chainId: ARC_TESTNET.id,
            },
          ]
        : [
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "getTerms" as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "getStage" as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "raised" as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "funderAllocated" as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "claimableFunder" as const,
              args: [address ?? zeroAddress] as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "funderClaimedBy" as const,
              args: [address ?? zeroAddress] as const,
              chainId: ARC_TESTNET.id,
            },
            {
              address: match.address,
              abi: campaignAbi,
              functionName: "isRevenueRightMature" as const,
              chainId: ARC_TESTNET.id,
            },
          ],
  );
  const detail = useReadContracts({
    contracts: detailContracts,
    query: {
      enabled: !!address && onArc && matches.length > 0,
      retry: 1,
      refetchInterval: 15_000,
    },
  });
  const rows = useMemo<Row[]>(() => {
    if (!detail.data) return [];
    const stride = mode === "creator" ? 6 : 7;
    return matches.flatMap<Row>((match, matchIndex) => {
      const at = (offset: number) => {
        const read = detail.data?.[matchIndex * stride + offset];
        return read?.status === "success" ? read.result : undefined;
      };
      if (mode === "creator") {
        const terms = match.terms;
        const stage = at(0) as number | undefined;
        const raised = at(1) as bigint | undefined;
        const creatorAllocated = at(2) as bigint | undefined;
        const creatorClaimed = at(3) as bigint | undefined;
        const withdrawableTranche = at(4) as bigint | undefined;
        const paidTranche = at(5) as bigint | undefined;
        if (
          !terms ||
          stage === undefined ||
          raised === undefined ||
          creatorAllocated === undefined ||
          creatorClaimed === undefined ||
          withdrawableTranche === undefined ||
          paidTranche === undefined
        )
          return [];
        return [
          {
            mode: "creator" as const,
            address: match.address,
            terms,
            stage,
            raised,
            creatorAllocated,
            creatorClaimed,
            withdrawableTranche,
            paidTranche,
          },
        ];
      }
      const terms = at(0) as CampaignTerms | undefined;
      const stage = at(1) as number | undefined;
      const raised = at(2) as bigint | undefined;
      const funderAllocated = at(3) as bigint | undefined;
      const claimable = at(4) as bigint | undefined;
      const claimed = at(5) as bigint | undefined;
      const mature = at(6) as boolean | undefined;
      if (
        !terms ||
        stage === undefined ||
        raised === undefined ||
        funderAllocated === undefined ||
        claimable === undefined ||
        claimed === undefined ||
        mature === undefined ||
        match.contribution === undefined
      )
        return [];
      return [
        {
          mode: "backer" as const,
          address: match.address,
          terms,
          stage,
          raised,
          funderAllocated,
          contribution: match.contribution,
          claimable,
          claimed,
          mature,
        },
      ];
    });
  }, [detail.data, matches, mode]);

  const loading =
    count.isPending ||
    (pageLength > 0 && pageCampaigns.isPending) ||
    (addresses.length > 0 && filterReads.isPending) ||
    (matches.length > 0 && detail.isPending);
  const incomplete =
    count.isError ||
    pageCampaigns.isError ||
    filterReads.isError ||
    detail.isError ||
    (pageCampaigns.data?.some((read) => read.status === "failure") ?? false) ||
    (filterReads.data?.some((read) => read.status === "failure") ?? false) ||
    (detail.data?.some((read) => read.status === "failure") ?? false) ||
    (detail.data !== undefined && rows.length < matches.length);

  function retry() {
    void count.refetch();
    void pageCampaigns.refetch();
    void filterReads.refetch();
    void detail.refetch();
  }

  return (
    <div className="space-y-3">
      <Card className="border-white/10 bg-[#04141C]">
        <CardContent className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-3 text-sm [&_p]:my-0 [&_div>div]:mt-0 [&_div>div]:gap-2">
          <WalletConnect />
        </CardContent>
      </Card>

      {!factory ? (
        <p role="status">
          The Arc Testnet factory deployment has not been configured yet.
        </p>
      ) : !address ? (
        <p role="status">
          {mode === "creator"
            ? "Connect your wallet to see your campaigns."
            : "Connect your wallet to see your backed films."}
        </p>
      ) : !onArc ? (
        <p role="status">
          Switch to Arc Testnet to load your{" "}
          {mode === "creator" ? "campaigns" : "backed films"}.
        </p>
      ) : count.isPending ? (
        <p role="status">Loading factory campaigns…</p>
      ) : count.isError || total === undefined ? (
        <div role="alert" className="space-y-3">
          <p>Could not read the factory campaign list from Arc Testnet.</p>
          <Button onClick={() => void count.refetch()}>
            Retry campaign list
          </Button>
        </div>
      ) : total === 0 ? (
        <p>
          No campaigns have been created on the configured factory yet.{" "}
          <Link
            className="text-[#d3ed05] font-semibold hover:text-[#e4ff1a] underline"
            href={mode === "creator" ? "/create" : "/demo"}
          >
            {mode === "creator" ? "Create a campaign" : "Discover films"}
          </Link>
          .
        </p>
      ) : (
        <>
          {incomplete && (
            <div role="alert" className="space-y-3">
              <p>
                Some campaign data could not be read. The list below may be
                incomplete.
              </p>
              <Button onClick={retry}>Retry reads</Button>
            </div>
          )}
          {loading ? (
            <p role="status">Loading your campaign data…</p>
          ) : matches.length === 0 ? (
            <p>
              {mode === "creator"
                ? "No campaigns created by this wallet in this range."
                : "No contributions from this wallet in this range."}
            </p>
          ) : rows.length === 0 ? (
            <p role="alert">Campaign details are unavailable for this range.</p>
          ) : (
            <div className="grid gap-3 min-[761px]:grid-cols-2">
              {rows.map((row) =>
                row.mode === "creator" ? (
                  <CreatorCard key={row.address} row={row} />
                ) : (
                  <BackerCard key={row.address} row={row} />
                ),
              )}
            </div>
          )}
          {total > PAGE_SIZE && (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <Button
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span>
                Campaigns {start + 1}–{start + pageLength} of {total}
              </span>
              <Button
                disabled={currentPage >= lastPage}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CreatorCard({ row }: { row: Extract<Row, { mode: "creator" }> }) {
  const creatorDue =
    row.creatorAllocated > row.creatorClaimed
      ? row.creatorAllocated - row.creatorClaimed
      : 0n;
  const trancheDue =
    row.withdrawableTranche > row.paidTranche
      ? row.withdrawableTranche - row.paidTranche
      : 0n;
  return (
    <Card className="border-white/10 bg-[#04141C]">
      <CardHeader className="space-y-1 p-4 pb-2">
        <p className="text-xs">
          <span
            className={`inline-block rounded-full border px-3 py-0.5 text-[11px] font-bold ${stagePillClass(CAMPAIGN_STAGES[row.stage] ?? "")}`}
          >
            {CAMPAIGN_STAGES[row.stage] ?? "Unknown stage"}
          </span>
        </p>
        <CardTitle className="font-dela text-lg uppercase">
          <Link className="break-all underline" href={filmPath(row.address)}>
            {short(row.address)}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>
          {usdc(row.raised)} raised of {usdc(row.terms.fundingGoal)}
        </p>
        <dl className="grid gap-3 text-sm [&_dd]:mt-1 [&_dd]:font-semibold [&_dt]:text-xs [&_dt]:text-white/50">
          <div>
            <dt>Approved tranche not yet claimed</dt>
            <dd>{usdc(trancheDue)}</dd>
          </div>
          <div>
            <dt>Creator viewing receipts</dt>
            <dd>
              {row.stage === RELEASED_STAGE
                ? `${usdc(creatorDue)} available`
                : "Not available at this stage"}
            </dd>
          </div>
          <div>
            <dt>Backer share</dt>
            <dd>{row.terms.funderBps / 100}%</dd>
          </div>
        </dl>
        <Link
          className="inline-block text-sm font-semibold text-primary underline"
          href={filmPath(row.address)}
        >
          Open campaign actions →
        </Link>
      </CardContent>
    </Card>
  );
}

function BackerCard({ row }: { row: Extract<Row, { mode: "backer" }> }) {
  const cap = (row.raised * BigInt(row.terms.repaymentCapBps)) / BPS;
  const remainingCap =
    cap > row.funderAllocated ? cap - row.funderAllocated : 0n;
  const refundable = REFUND_STAGES.has(row.stage) && row.contribution > 0n;
  return (
    <Card className="border-white/10 bg-[#04141C]">
      <CardHeader>
        <p className="text-xs">
          <span
            className={`inline-block rounded-full border px-3 py-0.5 text-[11px] font-bold ${stagePillClass(CAMPAIGN_STAGES[row.stage] ?? "")}`}
          >
            {CAMPAIGN_STAGES[row.stage] ?? "Unknown stage"}
          </span>
        </p>
        <CardTitle className="font-dela text-lg uppercase">
          <Link className="break-all underline" href={filmPath(row.address)}>
            {short(row.address)}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        <dl className="grid gap-2 text-sm [&_dd]:mt-0.5 [&_dd]:font-semibold [&_dd]:break-words [&_dt]:text-[11px] [&_dt]:text-white/50">
          <div>
            <dt>Contribution</dt>
            <dd>{usdc(row.contribution)}</dd>
          </div>
          <div>
            <dt>Accrued receipts</dt>
            <dd>{usdc(row.claimable)}</dd>
          </div>
          <div>
            <dt>Receipts already claimed</dt>
            <dd>{usdc(row.claimed)}</dd>
          </div>
          {row.stage === RELEASED_STAGE && (
            <div>
              <dt>Remaining collective cap</dt>
              <dd>{usdc(remainingCap)} of {usdc(cap)}</dd>
            </div>
          )}
          <div>
            <dt>Funder revenue rights</dt>
            <dd>
              {row.stage !== RELEASED_STAGE
                ? "Not available at this stage"
                : row.mature
                  ? "Matured — creator keeps future receipts"
                  : "Active"}
            </dd>
          </div>
          <div>
            <dt>Refund</dt>
            <dd>
              {refundable ? "Available on campaign page" : "Not available"}
            </dd>
          </div>
        </dl>
        <Link
          className="inline-block text-sm font-semibold text-primary underline"
          href={filmPath(row.address)}
        >
          Open campaign actions →
        </Link>
      </CardContent>
    </Card>
  );
}
