import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export function InfrastructureGrid() {
  return (
    <section
      id="features"
      className="scroll-mt-20 border-t border-border bg-background px-[var(--landing-gutter)] py-24 text-foreground"
      aria-labelledby="features-title"
    >
      <div className="landing-enter mx-auto mb-14 max-w-2xl text-center">
        <p className="mb-4 text-xs font-bold tracking-[.2em] text-primary uppercase">
          Built for the full journey
        </p>
        <h2
          id="features-title"
          className="text-[clamp(34px,5vw,62px)] leading-[1.02] font-black tracking-[-.05em] text-foreground uppercase"
        >
          A stronger foundation{" "}
          <span className="text-muted-foreground">for every story.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-muted-foreground">
          Transparent settlement on Arc, public campaign discovery on Arkiv,
          and a testnet-first path from pitch to viewing.
        </p>
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 lg:grid-cols-2">
        <article className="landing-enter flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card">
          <div className="p-7 md:p-9">
            <p className="text-[10px] font-bold tracking-[.2em] text-primary uppercase">
              Campaign terms
            </p>
            <h3 className="mt-4 text-3xl leading-[1.05] font-black text-foreground uppercase md:text-4xl">
              Milestone-based
              <br />
              funding.
            </h3>
            <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
              Campaign contracts are designed to hold test USDC contributions
              and release production tranches against approved milestones.
            </p>
            <Link
              href="/film/the-last-monsoon"
              className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline"
            >
              Open a funding example <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="relative mt-4 min-h-52 overflow-hidden">
            <Image
              src="https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1200&q=75"
              alt=""
              fill
              sizes="(min-width: 1024px) 45vw, 90vw"
              className="object-cover"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-card" />
          </div>
        </article>

        <article className="landing-enter flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="p-7 md:p-9">
            <p className="text-[10px] font-bold tracking-[.2em] text-primary uppercase">
              Discovery
            </p>
            <h3 className="mt-4 text-3xl leading-[1.05] font-black text-foreground uppercase md:text-4xl">
              Findable beyond
              <br />
              one interface.
            </h3>
            <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
              Campaign listings are designed to be publicly queryable on Arkiv,
              so audiences can find stories outside a single app.
            </p>
            <p className="mt-6 text-2xl font-black tracking-[-.05em] text-foreground">
              Arkiv
            </p>
          </div>
          <div className="relative mt-auto min-h-[300px] overflow-hidden">
            <Image
              src="https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1200&q=75"
              alt=""
              fill
              sizes="(min-width: 1024px) 45vw, 90vw"
              className="object-cover"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-card" />
          </div>
        </article>

        <article className="landing-enter flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="p-7 md:p-9">
            <p className="text-[10px] font-bold tracking-[.2em] text-primary uppercase">
              Settlement
            </p>
            <h3 className="mt-4 text-3xl leading-[1.05] font-black text-foreground uppercase md:text-4xl">
              Access that
              <br />
              settles clearly.
            </h3>
            <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
              Arc Testnet is the source of economic truth for test USDC
              contributions, viewing purchases and eligible receipts.
            </p>
          </div>
          <div className="relative min-h-36 overflow-hidden">
            <Image
              src="https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1200&q=75"
              alt=""
              fill
              sizes="(min-width: 1024px) 45vw, 90vw"
              className="object-cover"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-card via-transparent" />
          </div>
          <div className="flex items-end justify-between gap-4 p-7 pt-5 md:p-9 md:pt-6">
            <p className="text-2xl font-black tracking-[-.05em] text-foreground">
              Arc
            </p>
            <span className="rounded-full border border-border px-3 py-1 text-[10px] font-bold tracking-[.16em] text-muted-foreground uppercase">
              Arc Testnet
            </span>
          </div>
        </article>

        <article className="landing-enter flex flex-col justify-between gap-8 rounded-xl border border-primary/30 bg-muted p-7 md:p-9">
          <div>
            <p className="text-[10px] font-bold tracking-[.2em] text-primary uppercase">
              Get started
            </p>
            <h3 className="mt-4 text-3xl leading-[1.05] font-black text-foreground uppercase md:text-4xl">
              Ready to bring a story into frame?
            </h3>
            <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
              Explore campaign setup or walk through the testnet demo. The
              examples are fictional and no real funds are involved.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-xs font-bold text-primary-foreground transition hover:bg-primary/85"
            >
              Open campaign setup <ArrowRight size={16} />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary"
            >
              View the demo <ArrowUpRight size={15} />
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
