"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import {
  decodeEventLog,
  isAddress,
  parseUnits,
  zeroAddress,
  zeroHash,
} from "viem";
import {
  ARC_TESTNET,
  ARC_TESTNET_DEPLOYMENT,
  ARC_TESTNET_USDC,
} from "@/lib/chain";
import { campaignFactoryAbi } from "@cinevest/abi";
import { Button } from "@/components/ui/button";
import { TxStatus } from "@/components/ui/tx-status";
import { useTxFlow } from "@/lib/use-tx-flow";
import { filmPath } from "@/lib/paths";

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

export function FinanceTermsForm({ reviewer }: { reviewer: string }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [valid, setValid] = useState(false);
  const [campaign, setCampaign] = useState<string>();
  const flow = useTxFlow();
  // Nothing may resubmit while the deployment is mid-flow, unresolved or done.
  const locked =
    flow.busy ||
    flow.state === "uncertain" ||
    flow.state === "confirmed" ||
    !!campaign;
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: ARC_TESTNET.id });
  const writer = useWriteContract();
  const switchChain = useSwitchChain();
  const reviewerValid =
    isAddress(reviewer) &&
    reviewer !== zeroAddress &&
    reviewer.toLowerCase() !== address?.toLowerCase();

  async function deploy() {
    const factory = ARC_TESTNET_DEPLOYMENT.factoryAddress;
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (
      !factory ||
      !address ||
      !client ||
      !reviewerValid ||
      Object.keys(nextErrors).length ||
      locked
    )
      return;
    // Prompt the wallet to switch before any write when on the wrong network.
    if (chainId !== ARC_TESTNET.id) {
      switchChain.switchChain({ chainId: ARC_TESTNET.id });
      return;
    }
    let submitted = false;
    flow.start("deploy", "Confirm campaign deployment in your wallet.");
    try {
      const terms = {
        creator: address,
        reviewer: reviewer as `0x${string}`,
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
        pitchReference: zeroHash,
        worldGated: false,
        perHumanLimit: 0n,
      };
      const simulation = await client.simulateContract({
        address: factory,
        abi: campaignFactoryAbi,
        functionName: "createCampaign",
        args: [terms],
        account: address,
      });
      const hash = await writer.writeContractAsync({
        ...simulation.request,
        chainId: ARC_TESTNET.id,
      });
      submitted = true;
      await flow.awaitConfirm(hash, async (receipt) => {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
          try {
            const event = decodeEventLog({
              abi: campaignFactoryAbi,
              eventName: "CampaignCreated",
              data: log.data,
              topics: log.topics,
            });
            setCampaign(event.args.campaign);
            return "Campaign deployment confirmed.";
          } catch {
            /* Other factory logs do not identify the new campaign. */
          }
        }
        return "Deployment confirmed. Check the transaction to locate the new campaign.";
      });
    } catch (error) {
      flow.failed(error, submitted);
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
          Finance fields are valid. Review the immutable terms before deploying.
        </p>
      )}
      <p className="mt-1">
        This creates an ungated campaign without a Swarm pitch reference.
        Proposal text and uploads are not published yet.
      </p>
      {!reviewerValid && (
        <p role="status">
          Add a valid independent reviewer wallet in the proposal step.
        </p>
      )}
      {(!address || chainId !== ARC_TESTNET.id) && (
        <div className="mt-1 space-y-2">
          <p>
            {address
              ? "Switch to Arc Testnet to deploy."
              : "Connect your wallet on Arc Testnet to deploy."}
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
      <Button
        className="mt-2 h-9 min-h-9 text-xs"
        disabled={
          !valid || !reviewerValid || !address || locked
        }
        type="button"
        onClick={() => void deploy()}
      >
        {flow.busy ? "Deploying…" : "Deploy campaign on Arc Testnet"}
      </Button>
      <div className="mt-3">
        <TxStatus
          state={flow.state}
          message={flow.message}
          hash={flow.hash}
          checking={flow.checking}
          checkingAction={() => void flow.checkStatus()}
        />
      </div>
      {campaign && (
        <Link
          className="mt-3 block text-primary underline"
          href={filmPath(campaign)}
        >
          Open deployed campaign
        </Link>
      )}
    </form>
  );
}
