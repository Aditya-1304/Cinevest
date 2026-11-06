"use client";

import { useEffect, useRef, useState } from "react";
import { WalletConnect } from "@/components/wallet/wallet-connect";
import { FinanceTermsForm } from "./finance-terms-form";

export function CreateWorkspace() {
  const [step, setStep] = useState(0);
  const [reviewer, setReviewer] = useState("");
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
            Sketch your campaign in two steps. Deployment to Arc Testnet is
            live; Swarm pitch upload and Arkiv listing come later.
          </p>
        </div>
        <div className="mt-6 min-w-[210px] text-xs min-[761px]:mt-0 min-[761px]:max-w-[300px]">
          <WalletConnect />
        </div>
      </div>
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-[#04141C] min-[761px]:h-[min(540px,calc(100svh-230px))] min-[761px]:grid-cols-[200px_minmax(0,1fr)]">
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
            Live on Arc Testnet
            <br />
            <small>
              Swarm pitch upload and Arkiv listing unlock at later steps.
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
            <div className="grid grid-cols-1 gap-x-5 min-[761px]:grid-cols-2">
              <div className="my-1.5 grid gap-1 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-white/15 [&_input]:bg-[#072733] [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-white [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[#d3ed05] [&_input[aria-invalid=true]]:border-[#ef8888] [&_label]:text-[13px] [&_label]:font-bold [&_small]:text-[13px] [&_small]:leading-[1.6] [&_small]:text-white/60 [&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-white/15 [&_textarea]:bg-[#072733] [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[#d3ed05]">
                <label htmlFor="film-title">Film title</label>
                <input id="film-title" placeholder="Your film title" />
              </div>
              <div className="my-1.5 grid gap-1 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-white/15 [&_input]:bg-[#072733] [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-white [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-[#d3ed05] [&_input[aria-invalid=true]]:border-[#ef8888] [&_label]:text-[13px] [&_label]:font-bold [&_small]:text-[13px] [&_small]:leading-[1.6] [&_small]:text-white/60 [&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-white/15 [&_textarea]:bg-[#072733] [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-[#d3ed05]">
                <label htmlFor="film-genre">Genre</label>
                <input id="film-genre" placeholder="e.g. Drama" />
              </div>
              <div className="my-1.5 grid gap-1 min-[761px]:col-span-2 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-white/15 [&_input]:bg-[#072733] [&_input]:px-3 [&_input]:py-2.5 [&_label]:text-[13px] [&_label]:font-bold [&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-white/15 [&_textarea]:bg-[#072733] [&_textarea]:px-3 [&_textarea]:py-2.5">
                <label htmlFor="film-pitch">Pitch</label>
                <textarea
                  id="film-pitch"
                  rows={3}
                  placeholder="Tell supporters about your film"
                />
              </div>
              <div className="my-1.5 grid gap-1 min-[761px]:col-span-2 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-white/15 [&_input]:bg-[#072733] [&_input]:px-3 [&_input]:py-2.5 [&_label]:text-[13px] [&_label]:font-bold [&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-white/15 [&_textarea]:bg-[#072733] [&_textarea]:px-3 [&_textarea]:py-2.5">
                <label htmlFor="reviewer">Independent reviewer wallet</label>
                <input
                  id="reviewer"
                  placeholder="0x…"
                  value={reviewer}
                  onChange={(event) => setReviewer(event.target.value)}
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-between gap-3">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-transparent px-5 py-3 text-xs font-bold text-white/60"
                disabled
              >
                Upload pitch and poster
              </button>
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
            <FinanceTermsForm reviewer={reviewer} />
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
