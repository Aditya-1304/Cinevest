import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { demoFilms } from "@/lib/demo-films";

export function LandingAbout() {
  return (
    <section
      id="about"
      className="scroll-mt-20 border-t border-border bg-background px-[var(--landing-gutter)] py-24"
    >
      <div className="landing-enter mx-auto max-w-3xl text-center">
        <p className="mb-5 text-xs font-bold tracking-[.2em] text-primary uppercase">
          About CineVest
        </p>
        <h2 className="text-[clamp(34px,5vw,62px)] leading-[1.02] font-black tracking-[-.05em] text-foreground uppercase">
          A shared frame for{" "}
          <span className="text-muted-foreground">independent film.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
          Filmmakers, backers and audiences should be able to see the same
          story and the same terms. CineVest explores that idea as a testnet
          prototype.
        </p>
      </div>

      <div
        id="discover"
        className="mx-auto mt-16 grid max-w-5xl scroll-mt-24 gap-10 md:grid-cols-3 md:gap-7"
      >
        {demoFilms.map((film) => (
          <Link
            key={film.id}
            href={`/film/${film.id}`}
            className="landing-enter group mx-auto block w-full max-w-[340px] rounded-xl border border-border p-3"
            aria-label={`Open ${film.title}`}
          >
            <div className="relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-xl p-5 text-white">
              <Image
                src={film.poster}
                alt=""
                fill
                sizes="(min-width: 768px) 30vw, 90vw"
                className="object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <div className="relative">
                <p className="text-[10px] font-bold tracking-[.18em] text-white/55 uppercase">
                  CineVest presents
                </p>
                <h3 className="mt-2 text-3xl leading-none font-black uppercase">
                  {film.title}
                </h3>
                <p className="mt-2 text-xs text-white/65">
                  {film.genre} / {film.creator}
                </p>
              </div>
              <div className="relative mt-4 flex items-center justify-between rounded-2xl border border-primary/60 bg-black/30 p-3 backdrop-blur-md">
                <div>
                  <p className="text-[10px] tracking-[.16em] text-white/55 uppercase">
                    Stage
                  </p>
                  <p className="mt-0.5 text-sm font-bold">{film.status}</p>
                </div>
                <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
                  <ArrowRight size={17} />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="landing-enter mx-auto mt-20 max-w-3xl text-center">
        <h2 className="text-[clamp(30px,4.4vw,54px)] leading-[1.04] font-black tracking-[-.05em] text-foreground uppercase">
          Every milestone{" "}
          <span className="text-muted-foreground">in the open.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-muted-foreground">
          The prototype is built around milestone-based funding, public
          campaign discovery and pay-per-view settlement, so the journey can be
          followed rather than guessed.
        </p>
      </div>
    </section>
  );
}
