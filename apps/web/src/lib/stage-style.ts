import { CAMPAIGN_STAGES } from "@/lib/chain";

/** Shared stage pill colours so the film page and dashboards read the same. */
export const STAGE_PILL: Record<(typeof CAMPAIGN_STAGES)[number], string> = {
  Funding: "border-[#d3ed05]/40 bg-[#d3ed05]/15 text-[#d3ed05]",
  Refundable: "border-amber-400/40 bg-amber-400/15 text-amber-300",
  Production: "border-sky-400/40 bg-sky-400/15 text-sky-300",
  Released: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
  CancelledProduction: "border-red-400/40 bg-red-400/15 text-red-300",
};

export function stagePillClass(stage: string) {
  return STAGE_PILL[stage as (typeof CAMPAIGN_STAGES)[number]] ??
    "border-white/15 bg-white/5 text-white/70";
}
