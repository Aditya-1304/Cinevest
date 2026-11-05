import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { demoFilms } from "@/lib/demo-films";

const featured = demoFilms[0];

const STATS = [
  { value: "3", label: "example campaigns" },
  { value: "2", label: "testnet networks" },
  { value: "6", label: "USDC decimals" },
];

export function LandingHero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-14 sm:pt-20">
      <Image
        src="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=2000&q=75"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-bottom opacity-60"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/30 to-background"
      />

      <div className="relative mx-auto px-[var(--landing-gutter)]">
        <div className="landing-enter mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1.5 text-[10px] font-bold tracking-[.16em] text-foreground uppercase sm:text-[11px]">
            <span className="size-1.5 rounded-full bg-primary" />
            Testnet prototype / Arc + Arkiv
          </span>
          <h1 className="mt-6 text-[clamp(46px,9vw,96px)] leading-[.92] font-black tracking-[-.065em] text-foreground uppercase">
            Stories worth
            <br />
            <span className="text-primary">backing.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            CineVest is a testnet prototype for transparent film funding and
            pay-per-view settlement. Follow a story from campaign terms to the
            final frame.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#discover"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:bg-primary/85"
            >
              Explore campaigns <ArrowRight size={17} />
            </a>
            <Link
              href="/create"
              className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-border px-6 text-sm font-bold text-foreground transition hover:border-primary/60 hover:text-primary"
            >
              Try campaign setup <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl items-center gap-8 lg:mt-16 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <div className="landing-enter mx-auto w-full max-w-[360px]">
            <article className="rounded-xl border border-border p-3">
              <Link
                href={`/film/${featured.id}`}
                className="group relative flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-xl p-5 text-white"
                aria-label={`Open ${featured.title}`}
              >
                <Image
                  src={featured.poster}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 30vw, 90vw"
                  className="object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10"
                />
                <span className="relative w-fit rounded-full border border-white/20 bg-black/25 px-3 py-1 text-[10px] font-bold tracking-[.14em] uppercase backdrop-blur">
                  Featured example
                </span>
                <div className="relative">
                  <p className="text-xs font-semibold text-primary">
                    {featured.genre} / {featured.creator}
                  </p>
                  <h2 className="mt-2 text-3xl leading-[1.05] font-black uppercase">
                    {featured.title}
                  </h2>
                  <p className="mt-2 text-[11px] leading-5 text-white/60">
                    Fictional campaign preview
                  </p>
                </div>
                <div className="relative flex items-center justify-between rounded-2xl border border-primary/60 bg-black/35 p-3 backdrop-blur-md transition group-hover:border-primary">
                  <div>
                    <p className="text-[10px] tracking-[.16em] text-white/55 uppercase">
                      Stage
                    </p>
                    <p className="mt-0.5 text-sm font-bold">{featured.status}</p>
                  </div>
                  <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
                    <ArrowRight size={19} />
                  </span>
                </div>
              </Link>
            </article>
            <p className="mt-4 text-center text-sm leading-6 text-muted-foreground">
              A fictional example of how a CineVest campaign page brings the
              story, terms and progress into one frame.
            </p>
          </div>

          <div className="landing-enter rounded-xl border border-border bg-card/70 p-7 backdrop-blur sm:p-9">
            <p className="text-[10px] font-bold tracking-[.2em] text-primary uppercase">
              Prototype at a glance
            </p>
            <div className="mt-6 divide-y divide-border">
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-end gap-4 py-5 first:pt-0 last:pb-0"
                >
                  <span className="font-black text-5xl leading-none tracking-[-.06em] text-foreground sm:text-6xl">
                    {stat.value}
                  </span>
                  <span className="pb-1 text-sm leading-5 text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-7 border-t border-border pt-5 text-[11px] leading-5 text-muted-foreground">
              Testnet only. Test USDC has no monetary value. No mainnet
              deployment.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
