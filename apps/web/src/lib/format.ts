/** Exact display formatting for Arc Testnet values; all currency math stays in bigint. */
import { formatUnits } from "viem";

// Arc Testnet USDC is the only currency shown; six-decimal base units.
export function formatUsdc(value: bigint) {
  const [whole, fraction = ""] = formatUnits(value, 6).split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
}

export function formatDeadline(value: bigint) {
  return new Date(Number(value) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
