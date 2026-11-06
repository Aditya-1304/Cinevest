"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    label: "Backer share (bps)",
    hint: "10,000 basis points = 100%",
  },
  {
    name: "repaymentCapBps",
    label: "Repayment cap (bps)",
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
  onNewFilm,
}: {
  reviewer: string;
  proposal: ProposalDraft;
  /** Called after the user sets aside or finishes a film so the parent can clear the proposal. */
  onNewFilm?: () => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [valid, setValid] = useState(false);
  const [world, setWorld] = useState({ gated: false, limit: "", round: "" });
  const [worldErrors, setWorldErrors] = useState<{ limit?: string; round?: string }>({});
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
  /** Single most relevant reason publishing is blocked, so the form shows one status line. */
  const blocker = !reviewerValid
    ? "Add a valid independent reviewer wallet in the proposal step."
    : issue && !hasProgress
      ? issue
      : !address
        ? "Connect your wallet on Arc Testnet to publish."
        : chainId !== ARC_TESTNET.id
          ? "Switch to Arc Testnet to publish."
          : null;

  /** World gating needs a per-human cap; an optional verified first round counts unique humans. */
  function validateWorld() {
    const next: { limit?: string; round?: string } = {};
    if (world.gated) {
      if (!validAmount(world.limit))
        next.limit = "Enter a positive cap with at most 6 decimal places.";
      else if (
        validAmount(values.fundingGoal) &&
        parseUnits(world.limit, 6) > parseUnits(values.fundingGoal, 6)
      )
        next.limit = "The cap cannot exceed the funding goal.";
      if (world.round && !integerInRange(world.round, 1n, 1_000_000n))
        next.round = "Enter a whole number of humans from 1 to 1,000,000.";
    }
    setWorldErrors(next);
    return next;
  }

  async function deploy() {
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(validateWorld()).length) return;
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
          worldGated: world.gated,
          perHumanLimit: world.gated ? parseUnits(world.limit, 6) : 0n,
        },
        verifiedRound: world.gated && world.round ? Number(world.round) : undefined,
      });
    } finally {
      setStarting(false);
    }
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setValid(
      Object.keys(nextErrors).length === 0 &&
        Object.keys(validateWorld()).length === 0,
    );
  }

  return (
    <form
      onSubmit={review}
      noValidate
      className="mt-2 text-white [&_p]:text-xs [&_p]:leading-[1.4] [&_p]:text-white/60"
    >
      <div className="grid grid-cols-1 gap-x-3 gap-y-2 min-[561px]:grid-cols-2 min-[1000px]:grid-cols-12">
        {fields.map((field, index) => (
          <div className={`my-0.5 grid ${index < 4 ? "min-[1000px]:col-span-3" : "min-[1000px]:col-span-4"} min-w-0 content-start gap-1.5 [&_small]:text-[10px] [&_small]:text-white/50`} key={field.name}>
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
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
      <fieldset
        className="mt-2 space-y-2 rounded-xl border border-white/10 px-3 py-2 [&_label]:text-xs [&_small]:text-[10px] [&_small]:text-white/50"
        disabled
      >
        <legend className="px-1 text-xs font-bold text-white">Legacy World funding (unavailable)</legend>
        <label className="flex flex-wrap items-center gap-x-3 gap-y-1 font-bold">
          <Input
            type="checkbox"
            checked={world.gated}
            onChange={(event) => {
              setWorld({ ...world, gated: event.target.checked });
              setValid(false);
            }}
          />
          Require World ID to fund (one wallet per verified human, up to a cap)
        </label>
        {world.gated && (
          <div className="grid gap-x-3 gap-y-2 min-[561px]:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor="worldLimit" className="font-bold">
                Cap per human (test USDC)
              </label>
              <Input
                id="worldLimit"
                type="text"
                inputMode="decimal"
                value={world.limit}
                aria-invalid={!!worldErrors.limit}
                onChange={(event) => {
                  setWorld({ ...world, limit: event.target.value });
                  setValid(false);
                }}
              />
              {worldErrors.limit && (
                <small role="alert" className="!text-[#ffaaaa]">{worldErrors.limit}</small>
              )}
            </div>
            <div className="grid gap-1">
              <label htmlFor="worldRound" className="font-bold">
                Verified first round: humans (optional)
              </label>
              <Input
                id="worldRound"
                type="text"
                inputMode="numeric"
                value={world.round}
                aria-invalid={!!worldErrors.round}
                onChange={(event) => {
                  setWorld({ ...world, round: event.target.value });
                  setValid(false);
                }}
              />
              <small>After this many unique verified humans fund, funding opens to everyone.</small>
              {worldErrors.round && (
                <small role="alert" className="!text-[#ffaaaa]">{worldErrors.round}</small>
              )}
            </div>
          </div>
        )}
      </fieldset>
      <p role="status" className="mt-2">
        {blocker ?? (valid
          ? "Terms look valid. Review them, then publish: this uploads to Swarm, deploys on Arc and lists on Arkiv (several signatures and two transactions)."
          : "Publishing uploads to Swarm, deploys on Arc Testnet and lists on Arkiv (several signatures and two transactions).")}
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
      <div className="mt-3 flex flex-wrap items-center gap-3">
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
            <Button
              className="h-9 min-h-9 text-xs"
              disabled={publication.running}
              type="button"
              onClick={() => {
                publication.startNew();
                onNewFilm?.();
              }}
            >
              Start a new film instead
            </Button>
          </>
        ) : (
          !published && (
            <>
            <button
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d3ed05] bg-[#d3ed05] px-4 text-xs font-bold text-black transition hover:border-[#e4ff1a] hover:bg-[#e4ff1a] disabled:opacity-50"
              type="submit"
              disabled={publication.running || starting}
            >
              Review terms
            </button>
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
            </>
          )
        )}
      </div>
      {published && (
        <div className="mt-2">
          <Button
            className="h-9 min-h-9 text-xs"
            type="button"
            onClick={() => {
                publication.startNew();
                onNewFilm?.();
              }}
          >
            Create another film
          </Button>
        </div>
      )}
      {publication.archived.length > 0 && !hasProgress && (
        <div className="mt-3 space-y-1 rounded-xl border border-white/10 p-3">
          <p className="!text-white/80">Unfinished publications you set aside</p>
          {publication.archived.map((item) => (
            <div
              key={item.digest}
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span className="text-white/70">
                {item.title || "Untitled film"}
                {item.campaign ? " · live on Arc, not listed yet" : ""}
              </span>
              <Button
                className="h-8 min-h-8 text-xs"
                type="button"
                disabled={publication.running || !item.digest}
                onClick={() => publication.restore(item.digest!)}
              >
                Resume this one
              </Button>
            </div>
          ))}
        </div>
      )}
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
