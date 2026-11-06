import Link from "next/link";
import { demoFilmPath } from "@/lib/paths";
import type { demoFilms } from "@/lib/demo-films";

export function FilmCard({ film }: { film: (typeof demoFilms)[number] }) {
  return (
    <article className="border-white/10 bg-[#04141C] overflow-hidden rounded-2xl border">
      <Link
        href={demoFilmPath(film.id)}
        className={`flex min-h-[230px] flex-col justify-between bg-[linear-gradient(145deg,#020b12cc,#07273399),url('/reel-orbit.svg')] bg-cover bg-center p-6 text-white [&>small]:text-[11px] [&>span]:text-[11px] [&>strong]:font-dela [&>strong]:text-4xl [&>strong]:leading-none [&>strong]:font-normal ${film.tone === "rose" ? "bg-[#384246]" : film.tone === "gold" ? "bg-[#374337]" : "bg-[#455f70]"}`}
      >
        <span>Cinevest presents</span>
        <strong>{film.title}</strong>
        <small>Fictional campaign preview</small>
      </Link>
      <div className="p-5">
        <div className="flex justify-between gap-2.5 text-[11px] text-white/60">
          <span>
            {film.genre} · {film.creator}
          </span>
          <span>{film.status}</span>
        </div>
        <h3 className="mt-4 mb-2 font-bold">
          <Link href={demoFilmPath(film.id)}>{film.title}</Link>
        </h3>
        <p className="min-h-[65px] text-[13px] leading-[1.7] text-white/60">
          {film.description}
        </p>
        <div
          className="mt-5 mb-3 h-[7px] overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Example funding progress"
          aria-valuenow={film.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            className="block h-full rounded-full bg-[#d3ed05]"
            style={{ width: `${film.progress}%` }}
          />
        </div>
        <div className="flex justify-between gap-2.5 text-[11px] text-white/60">
          <strong>{film.raised} test USDC</strong>
          <span>{film.progress}% of goal</span>
        </div>
      </div>
    </article>
  );
}
