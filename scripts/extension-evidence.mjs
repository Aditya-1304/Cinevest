import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const nonnegative = z.number().finite().nonnegative();
const rate = z.number().finite().min(0).max(1);
const measurement = z.object({
  provider: z.enum(["livepeer", "mux"]), samples: z.number().int().min(1),
  observedAt: z.iso.datetime(), periodSeconds: nonnegative.positive(),
  deliverySuccessRate: rate, p95StartupMs: nonnegative,
  measuredCostUsd: nonnegative, signedOnly: z.boolean(),
  unauthenticatedDenied: z.boolean(), authorizedPlaybackSucceeded: z.boolean(),
}).strict();
const evidenceSchema = z.object({
  workload: z.object({
    observedAt: z.iso.datetime(), samples: z.number().int().min(2),
    periodSeconds: nonnegative.positive(), recoverablePending: z.number().int().nonnegative(),
    manualCapacityPerPeriod: z.number().int().nonnegative(),
    oldestRecoverableSeconds: nonnegative, recoverySlaSeconds: nonnegative.positive(),
  }).strict().optional(),
  media: z.object({
    constraints: z.object({ minDeliverySuccessRate: rate, maxStartupMs: nonnegative.positive(), maxCostUsdPerPeriod: nonnegative }).strict(),
    baseline: measurement, alternative: measurement.optional(),
  }).strict().optional(),
}).strict();

/** Only measured, allowlisted fields enter reports; credentials and media identifiers are rejected. */
export function assessExtensions(input) {
  const evidence = evidenceSchema.parse(input);
  const fresh = (date) => {
    const age = Date.now() - Date.parse(date);
    return age >= 0 && age <= 24 * 60 * 60 * 1000;
  };
  const workload = evidence.workload;
  const media = evidence.media;
  const meets = (item) => item && fresh(item.observedAt)
    && item.deliverySuccessRate >= media.constraints.minDeliverySuccessRate
    && item.p95StartupMs <= media.constraints.maxStartupMs
    && item.measuredCostUsd <= media.constraints.maxCostUsdPerPeriod
    && item.signedOnly && item.unauthenticatedDenied && item.authorizedPlaybackSucceeded;
  const baselineFailed = media && fresh(media.baseline.observedAt) && (
    media.baseline.deliverySuccessRate < media.constraints.minDeliverySuccessRate
    || media.baseline.p95StartupMs > media.constraints.maxStartupMs
    || media.baseline.measuredCostUsd > media.constraints.maxCostUsdPerPeriod
  );
  const comparable = media?.alternative && media.alternative.provider !== media.baseline.provider
    && media.alternative.periodSeconds === media.baseline.periodSeconds
    && media.alternative.samples >= media.baseline.samples;
  return {
    schema: "Cinevest.extension-readiness.v1", assessedAt: new Date().toISOString(),
    evidenceSource: "operator-supplied measurements; not independently attested",
    workerRequired: Boolean(workload && fresh(workload.observedAt)
      && workload.recoverablePending > workload.manualCapacityPerPeriod
      && workload.oldestRecoverableSeconds > workload.recoverySlaSeconds),
    migrationJustified: Boolean(baselineFailed && comparable && meets(media.alternative)),
    workload: workload ?? null, media: media ?? null,
    explanation: "No automatic migration. Compare equal-duration measurements and require signed-only delivery plus denied unauthenticated playback.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output = "extension-readiness.json"] = process.argv.slice(2);
  if (!input) throw new Error("Usage: extension-evidence.mjs MEASUREMENTS.json [REPORT.json]");
  try {
    const report = assessExtensions(JSON.parse(await readFile(input, "utf8")));
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    console.log("Worker required: " + report.workerRequired + "; migration justified: " + report.migrationJustified);
  } catch {
    console.error("Measurement input is invalid; supply only the documented numeric and boolean fields.");
    process.exitCode = 1;
  }
}
