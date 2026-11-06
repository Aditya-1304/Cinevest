"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MAX_SYNOPSIS } from "@/lib/pitch-manifest";
import { WalletConnect } from "@/components/wallet/wallet-connect";
import { FinanceTermsForm } from "./finance-terms-form";
import {
  DEFAULT_RIGHTS_NOTICE,
  MAX_POSTER_UI_BYTES,
  POSTER_TYPES,
  proposalIssue,
  type ProposalDraft,
} from "@/lib/proposal";

const SYNOPSIS_UI_MAX = Math.min(MAX_SYNOPSIS, 2000);

export function CreateWorkspace() {
  const [step, setStep] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [reviewer, setReviewer] = useState("");
  const [proposal, setProposal] = useState<ProposalDraft>({
    title: "",
    genre: "",
    synopsis: "",
    rightsNotice: DEFAULT_RIGHTS_NOTICE,
    poster: null,
  });
  const edit = (patch: Partial<ProposalDraft>) =>
    setProposal((current) => ({ ...current, ...patch }));
  const posterError =
    proposal.poster && !POSTER_TYPES.includes(proposal.poster.type)
      ? "Use a JPEG, PNG, WebP or GIF image."
      : proposal.poster && proposal.poster.size > MAX_POSTER_UI_BYTES
        ? "The poster must be 1 MiB or smaller."
        : undefined;
  /** After a film is published or set aside, return to an empty form for the next one. */
  const resetForNewFilm = () => {
    setReviewer("");
    setProposal({ title: "", genre: "", synopsis: "", rightsNotice: DEFAULT_RIGHTS_NOTICE, poster: null });
    setFormKey((k) => k + 1);
    setStep(0);
  };
  const proposalHeading = useRef<HTMLHeadingElement>(null);
  const financeHeading = useRef<HTMLHeadingElement>(null);
  // Move focus only when the user switches steps; matching the initial value
  // keeps strict-mode double effects from focusing on first render.
  const lastStep = useRef(step);
  useEffect(() => {
    if (step === lastStep.current) return;
    lastStep.current = step;
    (step === 0 ? proposalHeading : financeHeading).current?.focus();
  }, [step]);
  return (
    <section className="w-full" aria-labelledby="create-title">
      <div className="mb-5 block gap-6 min-[761px]:flex min-[761px]:items-start min-[761px]:justify-between [&_h1]:max-w-[700px] [&>div:first-child>p:last-child]:max-w-[590px]">
        <div>
          <p className="text-xs font-bold !text-[#d3ed05]">Creator workspace</p>
          <h1 id="create-title" className="!my-2 !text-[clamp(28px,3vw,40px)]">
            Bring your story to life.
          </h1>
          <p>
            Describe your film, set the terms and publish: your pitch goes to
            Swarm, the campaign to Arc Testnet and the listing to Arkiv.
          </p>
        </div>
        <div className="mt-6 min-w-[210px] text-xs min-[761px]:mt-0 min-[761px]:max-w-[300px]">
          <WalletConnect />
        </div>
      </div>
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-[#04141C] min-[761px]:grid-cols-[200px_minmax(0,1fr)]">
        <aside
          className="border-b border-white/10 bg-[#072733] px-5 py-5 min-[761px]:border-r min-[761px]:border-b-0 [&>button]:flex [&>button]:w-full [&>button]:cursor-pointer [&>button]:items-center [&>button]:gap-3 [&>button]:rounded-md [&>button]:p-[10px] [&>button]:text-left [&>button]:text-xs [&>button]:text-white/60 [&>button_span]:text-[11px] [&>button_span]:text-white/40 [&>button[aria-current=step]]:bg-[#d3ed05]/10 [&>button[aria-current=step]]:text-white [&>button[aria-current=step]_span]:text-[#d3ed05] [&>p]:mb-3 [&>p]:text-xs [&>p]:font-bold"
          aria-label="Campaign setup steps"
        >
          <p className="!text-white/60">Campaign setup</p>
          {["Film proposal", "Finance terms"].map((label, index) => (
            <button
              key={label}
              type="button"
              aria-current={step === index ? "step" : undefined}
              onClick={() => setStep(index)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {label}
            </button>
          ))}
          <div className="text-[#d3ed05] mx-3 mt-5 text-xs font-bold min-[761px]:mt-10 [&_small]:mt-1 [&_small]:block [&_small]:leading-[1.6] [&_small]:font-normal [&_small]:text-white/50">
            Live on Arc, Swarm and Arkiv
            <br />
            <small>
              Poster and pitch are public and stored on Swarm. Terms are final
              once the campaign is deployed.
            </small>
          </div>
        </aside>
        <div className="p-4 min-[761px]:px-5 min-[761px]:py-4">
          {/* Keep both steps mounted so navigating back preserves draft inputs. */}
          <div hidden={step !== 0}>
            <div className="[&_h2:focus-visible]:outline-2 [&_h2:focus-visible]:outline-offset-4 [&_h2:focus-visible]:outline-[#d3ed05]/80 [&_h2]:my-1 [&_h2]:text-[clamp(24px,2.3vw,30px)] [&_p]:text-[13px] [&_span]:text-[11px] [&_span]:font-bold [&_span]:text-[#d3ed05]">
              <span>Step 01 / 02</span>
              <h2 ref={proposalHeading} tabIndex={-1}>
                Start with the story.
              </h2>
              <p>Give your future supporters a glimpse of your film.</p>
            </div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 min-[761px]:grid-cols-2 [&_small]:text-[11px] [&_small]:text-white/50">
              <div className="grid gap-1.5">
                <Label htmlFor="film-title">Film title</Label>
                <Input
                  id="film-title"
                  placeholder="Your film title"
                  maxLength={100}
                  value={proposal.title}
                  onChange={(event) => edit({ title: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="film-genre">Genre</Label>
                <Input
                  id="film-genre"
                  placeholder="e.g. Drama"
                  maxLength={60}
                  value={proposal.genre}
                  onChange={(event) => edit({ genre: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5 min-[761px]:col-span-2">
                <Label htmlFor="film-pitch">Pitch</Label>
                <Textarea
                  id="film-pitch"
                  rows={4}
                  maxLength={SYNOPSIS_UI_MAX}
                  placeholder="Tell supporters about your film"
                  value={proposal.synopsis}
                  onChange={(event) => edit({ synopsis: event.target.value })}
                />
                <small>
                  {proposal.synopsis.length}/{SYNOPSIS_UI_MAX} characters
                </small>
              </div>
              <div className="grid gap-1.5 min-[761px]:col-span-2">
                <Label htmlFor="reviewer">Independent reviewer wallet</Label>
                <Input
                  id="reviewer"
                  placeholder="0x…"
                  value={reviewer}
                  onChange={(event) => setReviewer(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5 min-[761px]:col-span-2">
                <Label htmlFor="film-poster">Poster image</Label>
                <Input
                  key={`poster-${formKey}`}
                  id="film-poster"
                  type="file"
                  accept={POSTER_TYPES.join(",")}
                  aria-invalid={!!posterError}
                  onChange={(event) => edit({ poster: event.target.files?.[0] ?? null })}
                />
                <small>
                  JPEG, PNG, WebP or GIF, up to 1 MiB. Poster and pitch are public on Swarm.
                </small>
                {posterError && (
                  <small role="alert" className="!text-[#ffaaaa]">
                    {posterError}
                  </small>
                )}
              </div>
              <div className="grid gap-1.5 min-[761px]:col-span-2">
                <Label htmlFor="film-rights">Rights notice</Label>
                <Textarea
                  id="film-rights"
                  rows={2}
                  value={proposal.rightsNotice}
                  onChange={(event) => edit({ rightsNotice: event.target.value })}
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3">
              <span className="text-xs text-white/60">
                {proposalIssue(proposal) ?? "Proposal ready."}
              </span>
              <button
                className="inline-flex items-center justify-center rounded-lg border border-[#d3ed05] bg-[#d3ed05] px-5 py-3 text-xs font-bold text-black transition hover:border-[#e4ff1a] hover:bg-[#e4ff1a]"
                type="button"
                onClick={() => setStep(1)}
              >
                Continue to finance terms →
              </button>
            </div>
          </div>
          <div hidden={step !== 1}>
            <div className="[&_h2:focus-visible]:outline-2 [&_h2:focus-visible]:outline-offset-4 [&_h2:focus-visible]:outline-[#d3ed05]/80 [&_h2]:my-1 [&_h2]:text-[clamp(24px,2.3vw,30px)] [&_p]:text-[13px] [&_span]:text-[11px] [&_span]:font-bold [&_span]:text-[#d3ed05]">
              <span>Step 02 / 02</span>
              <h2 ref={financeHeading} tabIndex={-1}>
                Set the terms.
              </h2>
              <p>
                Define how funding and eligible receipts work for your film.
              </p>
            </div>
            <FinanceTermsForm key={formKey} reviewer={reviewer} proposal={proposal} onNewFilm={resetForNewFilm} />
            <button
              type="button"
              className="hover:text-[#e4ff1a] mt-[18px] cursor-pointer border-0 bg-transparent text-xs font-bold text-[#d3ed05]"
              onClick={() => setStep(0)}
            >
              ← Back to proposal
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
