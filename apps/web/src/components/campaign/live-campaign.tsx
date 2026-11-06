"use client";

import { ARC_TESTNET, CAMPAIGN_STAGES } from "@/lib/chain";
import { formatUsdc, formatDeadline } from "@/lib/format";
import { type Address } from "viem";
import { useCampaign } from "@/lib/use-campaign";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletConnect } from "@/components/wallet/wallet-connect";
import { AddressLink } from "./address-link";
import { FilmStory } from "./film-story";
import { CampaignBoundary } from "./campaign-boundary";
import { CampaignActions } from "./campaign-actions";
import { MilestonePanel } from "./milestone-panel";
import { ReleasePanel } from "./release-panel";
import { BuyAccess } from "./buy-access";
import { ViewingEscrow } from "./viewing-escrow";
import { stagePillClass } from "@/lib/stage-style";

export function LiveCampaign({ campaign }: { campaign: Address }) {
  const { factory, address, chainId, registry, terms, stage, claimable, raised } =
    useCampaign(campaign);
  // Writes may only render on Arc with a factory-verified campaign.
  const onArc = chainId === ARC_TESTNET.id;
  const error = registry.error || terms.error || stage.error || raised.error;
  const stageName =
    stage.data === undefined ? undefined : CAMPAIGN_STAGES[stage.data];
  const progress =
    terms.data && raised.data !== undefined
      ? Number((raised.data * 10000n) / terms.data.fundingGoal)
      : 0;

  async function retry() {
    const result = await registry.refetch();
    if (result.isSuccess && result.data === true) {
      void terms.refetch();
      void stage.refetch();
      void raised.refetch();
      if (address) void claimable.refetch();
    }
  }

  return (
    <CampaignBoundary>
      <div className="w-full space-y-3">
        <FilmStory campaign={campaign} />
        <Card className="gap-0 overflow-hidden border-white/10 bg-[#04141C] py-0 shadow-[0_18px_60px_rgba(0,0,0,.3)]">
          <CardHeader className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/5 bg-white/[.02] px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-xs font-semibold text-primary">Arc Testnet</p>
              <CardTitle className="font-dela text-lg uppercase">Campaign contract</CardTitle>
            </div>
            <AddressLink address={campaign} />
          </CardHeader>
          <CardContent className="space-y-3 px-4 py-4">
            {!factory ? (
              <p role="status">
                The current contract deployment could not be verified. Funding stays unavailable until the matching revision is deployed.
              </p>
            ) : registry.data === false ? (
              <p role="alert">
                This address is not registered with the Cinevest factory on Arc
                Testnet. No actions are available.
              </p>
            ) : error ? (
              <div role="alert" className="space-y-3">
                <p>
                  Could not load campaign data from Arc Testnet. Check your
                  connection and retry.
                </p>
                <Button onClick={retry}>Retry reads</Button>
              </div>
            ) : !terms.data ||
              stage.data === undefined ||
              raised.data === undefined ? (
              <div role="status" className="space-y-2">
                <p className="sr-only">Loading verified campaign terms…</p>
                <div className="h-4 w-56 animate-pulse rounded bg-white/10" />
                <div className="h-4 w-80 max-w-full animate-pulse rounded bg-white/10" />
                <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
              </div>
            ) : !stageName ? (
              <p role="alert">
                The contract returned an unsupported campaign stage.
              </p>
            ) : (
              <>
                <div className="space-y-2 rounded-xl border border-white/5 bg-black/15 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm">
                      {formatUsdc(raised.data)} test USDC raised of{" "}
                      {formatUsdc(terms.data.fundingGoal)} test USDC
                    </p>
                    <p className="text-xs text-white/60">
                      Your accrued receipts:{" "}
                      <strong className="font-semibold text-foreground">
                        {!address
                          ? "—"
                          : claimable.error
                            ? "Unavailable"
                            : claimable.data === undefined
                              ? "…"
                              : `${formatUsdc(claimable.data)} test USDC`}
                      </strong>
                    </p>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-label="Funding progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(Number(progress) / 100)}
                  >
                    <div
                      className="h-full rounded-full bg-[#d3ed05]"
                      style={{ width: `${Math.min(100, Number(progress) / 100)}%` }}
                    />
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&_dd]:mt-1 [&_dd]:text-sm [&_dd]:font-semibold [&_dd]:break-all [&_dt]:text-[10px] [&_dt]:tracking-[.12em] [&_dt]:text-white/50 [&_dt]:uppercase [&_div]:rounded-lg [&_div]:border [&_div]:border-white/10 [&_div]:bg-white/[.03] [&_div]:p-2">
                  <div>
                    <dt>Stage</dt>
                    <dd>
                      <span
                        className={`inline-block rounded-full border px-3 py-0.5 text-xs font-bold ${stagePillClass(stageName)}`}
                      >
                        {stageName}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Funding goal</dt>
                    <dd>{formatUsdc(terms.data.fundingGoal)}</dd>
                  </div>
                  <div>
                    <dt>Viewing price</dt>
                    <dd>{formatUsdc(terms.data.watchPrice)}</dd>
                  </div>
                  <div>
                    <dt>Backer share</dt>
                    <dd>{terms.data.funderBps / 100}%</dd>
                  </div>
                  <div className="col-span-2">
                    <dt>Funding deadline</dt>
                    <dd>{formatDeadline(terms.data.fundingDeadline)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt>Production deadline</dt>
                    <dd>{formatDeadline(terms.data.productionDeadline)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt>Creator</dt>
                    <dd className="font-normal">
                      <AddressLink address={terms.data.creator} />
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt>Reviewer</dt>
                    <dd className="font-normal">
                      <AddressLink address={terms.data.reviewer} />
                    </dd>
                  </div>
                </dl>
                {address && claimable.error && (
                  <div role="alert" className="space-y-2">
                    <p>
                      Your receipts could not be loaded. Public campaign terms
                      remain available.
                    </p>
                    <Button onClick={() => void claimable.refetch()}>
                      Retry receipts
                    </Button>
                  </div>
                )}
                <p className="text-[11px] leading-[1.6] text-white/50">
                  Values are read from the registered Arc contract. Reads refresh
                  every 15 seconds.
                </p>
              </>
            )}
          </CardContent>
          <div className="border-t border-white/5 bg-black/10 px-4 py-2 text-xs">
            <WalletConnect compact />
          </div>
        </Card>
        {factory &&
          onArc &&
          !error &&
          registry.data === true &&
          terms.data &&
          stage.data !== undefined &&
          raised.data !== undefined &&
          stageName && (
            <div className="grid items-stretch gap-3 lg:grid-cols-2 [&_[data-slot=card]]:h-full [&_[data-slot=card]]:border-white/10 [&_[data-slot=card]]:bg-[#04141C] [&_[data-slot=card]]:shadow-[0_12px_40px_rgba(0,0,0,.25)]">
              <CampaignActions
                campaign={campaign}
                terms={terms.data}
                stage={stage.data}
              />
              <MilestonePanel
                campaign={campaign}
                terms={terms.data}
                stage={stage.data}
              />
              <ReleasePanel
                campaign={campaign}
                terms={terms.data}
                stage={stage.data}
              />
              <BuyAccess
                campaign={campaign}
                terms={terms.data}
                stage={stage.data}
              />
              <ViewingEscrow campaign={campaign} />
            </div>
          )}
      </div>
    </CampaignBoundary>
  );
}
