import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getDemoFilm } from "@/lib/demo-films";
import { demoWatchPath } from "@/lib/paths";

// Fictional demo films only; live contracts use the canonical /film/[chainId]/[campaign] route.
export default async function DemoFilmPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const film = getDemoFilm(slug);
  if (!film) notFound();
  const tone = film.tone === "rose" ? "#384246" : film.tone === "gold" ? "#374337" : "#455f70";
  return (
    <AppShell compact>
      <Link
        className="text-[#d3ed05] hover:text-[#e4ff1a] mb-4 inline-block text-sm font-bold"
        href="/demo"
      >
        ← All films
      </Link>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.8fr)]">
        <div>
          <div
            className={`flex h-[clamp(190px,30vh,280px)] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#020b12cc,#07273399),url('/reel-orbit.svg')] bg-cover bg-center p-5 text-white shadow-lg sm:p-6 [&_small]:text-[11px] [&_span]:text-[11px] [&_strong]:font-dela [&_strong]:text-[clamp(34px,4vw,52px)] [&_strong]:leading-none ${tone}`}
          >
            <span>Fictional film preview</span>
            <strong>{film.title}</strong>
            <small>A film by {film.creator}</small>
          </div>
          <div className="mt-3">
            <p className="text-xs font-bold !text-[#d3ed05]">The story</p>
            <h2>About the film</h2>
            <p>
              {film.description} This example campaign illustrates how a
              filmmaker can bring a story and its supporters together.
            </p>
          </div>
          <div className="mt-3">
            <h2 className="!mb-2">Production milestones</h2>
            <ol className="grid gap-2 [&_li]:flex [&_li]:items-start [&_li]:gap-3 [&_li]:border-l-2 [&_li]:border-[#d3ed05]/40 [&_li]:py-1 [&_li]:pl-3 [&_li]:font-bold [&_span]:mt-0.5 [&_span]:block [&_span]:text-xs [&_span]:font-normal [&_span]:text-white/70">
              <li>
                <strong>Development</strong>
                <span>Proposal and production planning</span>
              </li>
              <li>
                <strong>Production</strong>
                <span>Filming and evidence review</span>
              </li>
              <li>
                <strong>Delivery</strong>
                <span>Final review and film release</span>
              </li>
            </ol>
          </div>
        </div>
        <aside className="rounded-2xl border border-white/10 bg-[#04141C] p-5 shadow-xl sm:p-6 [&_h1]:!text-[30px] [&_p]:text-sm">
          <span
            className={`inline-block rounded-full border px-3 py-1 text-[11px] font-bold ${film.status === "Funding" ? "border-[#d3ed05]/40 bg-[#d3ed05]/15 text-[#d3ed05]" : "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"}`}
          >
            {film.status} · Example
          </span>
          <h1>{film.title}</h1>
          <p>
            {film.genre} by {film.creator}
          </p>
          <div className="mt-5 mb-3 h-[7px] overflow-hidden rounded-full bg-white/10 [&>span]:block [&>span]:h-full [&>span]:rounded-full [&>span]:bg-[#d3ed05]">
            <span style={{ width: `${film.progress}%` }} />
          </div>
          <strong className="text-[28px]">{film.raised}</strong>
          <p>test USDC of {film.goal} goal</p>
          <dl className="my-4 [&_dd]:m-0 [&_dd]:text-right [&_dd]:font-bold [&_dd]:[overflow-wrap:anywhere] [&_div]:flex [&_div]:flex-wrap [&_div]:justify-between [&_div]:gap-1.5 [&_div]:border-t [&_div]:border-white/10 [&_div]:py-2.5 [&_div]:text-xs min-[481px]:[&_div]:gap-5 [&_dt]:text-white/60">
            <div>
              <dt>Backer share</dt>
              <dd>{film.share}</dd>
            </div>
            <div>
              <dt>Collective cap</dt>
              <dd>{film.cap} of goal</dd>
            </div>
            <div>
              <dt>Funding deadline</dt>
              <dd>{film.deadline}</dd>
            </div>
            <div>
              <dt>Viewing price</dt>
              <dd>{film.price} test USDC</dd>
            </div>
          </dl>
          {film.status === "Released" ? (
            <Link
              className="inline-flex items-center justify-center rounded-lg border border-[#d3ed05] bg-[#d3ed05] px-5 py-[13px] text-xs font-bold text-black transition hover:border-[#e4ff1a] hover:bg-[#e4ff1a]"
              href={demoWatchPath(film.id)}
            >
              View watch page
            </Link>
          ) : (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 px-5 py-[13px] text-xs font-bold text-white/60"
              disabled
            >
              Contributions unavailable
            </button>
          )}
          <p className="!text-[11px]">
            Example values only. Backer returns are capped and not guaranteed;
            contributions do not grant film ownership.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
