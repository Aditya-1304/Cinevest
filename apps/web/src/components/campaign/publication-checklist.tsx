"use client";

import type { PublicationRecord, StepStatus } from "@/lib/use-publication";
import { ARC_TESTNET } from "@/lib/chain";
import { ARKIV_EXPLORER } from "@/lib/arkiv-creator";

const MARK: Record<StepStatus, string> = {
  idle: "○",
  active: "…",
  done: "✓",
  error: "✕",
};
const TONE: Record<StepStatus, string> = {
  idle: "text-white/50",
  active: "text-amber-300",
  done: "text-[#d3ed05]",
  error: "text-red-300",
};

/** Step-by-step publication progress with the current status message and explorer links. */
export function PublicationChecklist({
  steps,
  message,
  record,
}: {
  steps: { key: string; label: string; status: StepStatus }[];
  message: string;
  record?: PublicationRecord;
}) {
  const arcTx = record?.arcTxHash;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-[#030e14] p-3">
      <ol className="space-y-1 text-xs">
        {steps.map((step) => (
          <li key={step.key} className={`flex gap-2 ${TONE[step.status]}`}>
            <span aria-hidden="true" className="w-4 text-center">
              {MARK[step.status]}
            </span>
            <span>
              {step.label}
              <span className="sr-only"> — {step.status}</span>
            </span>
          </li>
        ))}
      </ol>
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs leading-[1.6] break-words text-white/80"
        >
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {arcTx && (
          <a
            className="text-[#d3ed05] underline"
            target="_blank"
            rel="noreferrer"
            href={`${ARC_TESTNET.blockExplorers.default.url}/tx/${arcTx}`}
          >
            Arc deployment transaction
          </a>
        )}
        {record?.arkivTxHash && (
          <a
            className="text-[#d3ed05] underline"
            target="_blank"
            rel="noreferrer"
            href={`${ARKIV_EXPLORER}/tx/${record.arkivTxHash}`}
          >
            Arkiv listing transaction
          </a>
        )}
      </div>
    </div>
  );
}
