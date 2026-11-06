"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAccount, useSwitchChain } from "wagmi";
import { isAddress, parseUnits, zeroAddress, zeroHash } from "viem";
import { ARC_TESTNET, ARC_TESTNET_USDC } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { filmPath } from "@/lib/paths";
import { usePublication } from "@/lib/use-publication";
import { PublicationChecklist } from "./publication-checklist";
import { posterPayload, proposalIssue, type ProposalDraft } from "@/lib/proposal";

const fields = [
  {
    name: "fundingGoal",
    label: "Funding goal (test USDC)",
    hint: "Up to 6 decimal places",
  },
  {
    name: "watchPrice",
    label: "Price per view (test USDC)",
    hint: "Up to 6 decimal places",
  },
  {
    name: "funderBps",
    label: "Backer share (basis points)",
    hint: "10,000 basis points = 100%",
  },
  {
    name: "repaymentCapBps",
    label: "Backer repayment cap (basis points)",
    hint: "15,000 basis points = 1.5× the funding goal",
  },
  {
    name: "fundingDeadline",
    label: "Funding deadline",
    type: "datetime-local",
    hint: "Your local time",
  },
  {
    name: "productionDeadline",
    label: "Production deadline",
    type: "datetime-local",
    hint: "Must be after the funding deadline",
  },
  {
    name: "rightsDuration",
    label: "Revenue-sharing duration (days)",
    hint: "Starts when the film is published",
  },
] as const;

type FieldName = (typeof fields)[number]["name"];
type Values = Record<FieldName, string>;
const initialValues: Values = {
  fundingGoal: "",
  watchPrice: "",
  funderBps: "",
  repaymentCapBps: "",
  fundingDeadline: "",
  productionDeadline: "",
  rightsDuration: "",
};
const maxUint256 = (1n << 256n) - 1n;
const maxUint64 = (1n << 64n) - 1n;

function validAmount(value: string) {
  if (!/^\d{1,78}(\.\d{1,6})?$/.test(value)) return false;
  const [whole, fraction = ""] = value.split(".");
  // USDC uses six decimals; integer arithmetic avoids rounding financial inputs.
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  return units > 0n && units <= maxUint256;
}

function integerInRange(value: string, min: bigint, max: bigint) {
  if (!/^\d{1,20}$/.test(value)) return false;
  const number = BigInt(value);
  return number >= min && number <= max;
}

function validate(values: Values): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  if (!validAmount(values.fundingGoal))
    errors.fundingGoal =
      "Enter a positive amount with at most 6 decimal places.";
  if (!validAmount(values.watchPrice))
    errors.watchPrice =
      "Enter a positive amount with at most 6 decimal places.";
  if (!integerInRange(values.funderBps, 0n, 10_000n))
    errors.funderBps = "Enter a whole number from 0 to 10,000.";
  if (!integerInRange(values.repaymentCapBps, 1n, 65_535n))
    errors.repaymentCapBps = "Enter a whole number from 1 to 65,535.";
  if (!integerInRange(values.rightsDuration, 1n, maxUint64 / 86_400n))
    errors.rightsDuration = "Enter a positive whole number of days.";
  const funding = new Date(values.fundingDeadline).getTime();
  const production = new Date(values.productionDeadline).getTime();
  if (!Number.isFinite(funding) || funding <= Date.now())
    errors.fundingDeadline = "Choose a future funding deadline.";
  if (
    !Number.isFinite(production) ||
    !Number.isFinite(funding) ||
    production <= funding
  )
    errors.productionDeadline = "Choose a date after the funding deadline.";
  return errors;
}

export function FinanceTermsForm({
  reviewer,
  proposal,
}: {
  reviewer: string;
  proposal: ProposalDraft;
}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [valid, setValid] = useState(false);
  const [starting, setStarting] = useState(false);
  const publication = usePublication();
  const { address, chainId } = useAccount();
  const switchChain = useSwitchChain();
  const record = publication.record;
  const published = !!record?.published;
  // A record that already holds progress is resumed, never restarted.
  const hasProgress = !!record && !published;
  const reviewerValid =
    isAddress(reviewer) &&
    reviewer !== zeroAddress &&
    reviewer.toLowerCase() !== address?.toLowerCase();
  const issue = proposalIssue(proposal);

  async function deploy() {
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (
      !address ||
      !reviewerValid ||
      issue ||
      Object.keys(nextErrors).length ||
      publication.running ||
      starting
    )
      return;
    setStarting(true);
    try {
      const poster = await posterPayload(proposal.poster!);
      publication.start({
        title: proposal.title,
        genre: proposal.genre,
        synopsis: proposal.synopsis,
        rightsNotice: proposal.rightsNotice,
        poster,
        terms: {
          creator: address,
          reviewer,
          usdc: ARC_TESTNET_USDC.address,
          fundingGoal: parseUnits(values.fundingGoal, 6),
          watchPrice: parseUnits(values.watchPrice, 6),
          funderBps: Number(values.funderBps),
          repaymentCapBps: Number(values.repaymentCapBps),
          fundingDeadline: BigInt(
            Math.floor(new Date(values.fundingDeadline).getTime() / 1000),
          ),
          productionDeadline: BigInt(
            Math.floor(new Date(values.productionDeadline).getTime() / 1000),
          ),
          rightsDuration: BigInt(values.rightsDuration) * 86400n,
          // Replaced by the Swarm root of the pitch before anything is signed.
          pitchReference: zeroHash,
          worldGated: false,
          perHumanLimit: 0n,
        },
      });
    } finally {
      setStarting(false);
    }
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setValid(Object.keys(nextErrors).length === 0);
  }

  return (
    <form
      onSubmit={review}
      noValidate
      className="mt-2 text-white [&_p]:text-xs [&_p]:leading-[1.4] [&_p]:text-white/60"
    >
      <p>
        These terms are intended to be immutable. Backer returns are capped and
        are not guaranteed.
      </p>
      <div className="grid grid-cols-1 gap-x-3 min-[561px]:grid-cols-2 min-[1000px]:grid-cols-3">
        {fields.map((field) => (
          <div
            className="my-1 grid min-w-0 content-start gap-1 [&_input]:h-9 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-white/15 [&_input]:bg-[#072733] [&_input]:px-2.5 [&_input]:py-1.5 [&_input]:text-sm [&_input]:text-white [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[#d3ed05] [&_input[aria-invalid=true]]:border-[#ef8888] [&_label]:text-xs [&_label]:font-bold [&_small]:text-[10px] [&_small]:leading-tight [&_small]:text-white/60"
            key={field.name}
          >
            <label htmlFor={field.name}>{field.label}</label>
            <input
              id={field.name}
              type={"type" in field ? field.type : "text"}
              inputMode={"type" in field ? undefined : "decimal"}
              value={values[field.name]}
              aria-invalid={!!errors[field.name]}
              aria-describedby={`${field.name}-hint${errors[field.name] ? ` ${field.name}-error` : ""}`}
              disabled={hasProgress || published}
              onChange={(event) => {
                setValues({ ...values, [field.name]: event.target.value });
                setValid(false);
              }}
            />
            <small id={`${field.name}-hint`}>{field.hint}</small>
            {errors[field.name] && (
              <small
                id={`${field.name}-error`}
                role="alert"
                className="!text-[#ffaaaa]"
              >
                {errors[field.name]}
              </small>
            )}
          </div>
        ))}
      </div>
      <button
        className="hover:border-[#e4ff1a] hover:bg-[#e4ff1a] mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-[#d3ed05] bg-[#d3ed05] px-4 text-xs font-bold text-black transition"
        type="submit"
      >
        Review terms
      </button>
      {valid && (
        <p role="status">
          Finance fields are valid. Review the immutable terms before publishing.
        </p>
      )}
      <p className="mt-1">
        Publishing uploads your poster and pitch to Swarm, deploys the campaign
        on Arc Testnet and lists it on Arkiv. You will be asked to sign several
        messages and two transactions.
      </p>
      {!reviewerValid && (
        <p role="status">
          Add a valid independent reviewer wallet in the proposal step.
        </p>
      )}
      {issue && !hasProgress && <p role="status">{issue}</p>}
      {(!address || chainId !== ARC_TESTNET.id) && (
        <div className="mt-1 space-y-2">
          <p>
            {address
              ? "Switch to Arc Testnet to publish."
              : "Connect your wallet on Arc Testnet to publish."}
          </p>
          {address && chainId !== ARC_TESTNET.id && (
            <Button
              className="h-9 min-h-9 text-xs"
              disabled={switchChain.isPending}
              onClick={() =>
                switchChain.switchChain({ chainId: ARC_TESTNET.id })
              }
            >
              {switchChain.isPending ? "Switching…" : "Switch to Arc Testnet"}
            </Button>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {hasProgress ? (
          <>
            <Button
              className="h-9 min-h-9 text-xs"
              disabled={!address || publication.running}
              type="button"
              onClick={publication.resume}
            >
              {publication.running ? "Publishing…" : "Resume publication"}
            </Button>
            {!record?.arcTxHash && (
              <Button
                className="h-9 min-h-9 text-xs"
                disabled={publication.running}
                type="button"
                onClick={publication.discard}
              >
                Discard draft
              </Button>
            )}
          </>
        ) : (
          !published && (
            <Button
              className="h-9 min-h-9 text-xs"
              disabled={
                !valid ||
                !reviewerValid ||
                !!issue ||
                !address ||
                publication.running ||
                starting
              }
              type="button"
              onClick={() => void deploy()}
            >
              {publication.running || starting
                ? "Publishing…"
                : "Publish campaign"}
            </Button>
          )
        )}
      </div>
      {(record || publication.message) && (
        <PublicationChecklist
          steps={publication.steps}
          message={publication.message}
          record={record}
        />
      )}
      {published && record?.campaign && (
        <Link
          className="mt-3 block text-primary underline"
          href={filmPath(record.campaign)}
        >
          Open published campaign
        </Link>
      )}
    </form>
  );
}
