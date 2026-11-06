import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getDemoFilm } from "@/lib/demo-films";
import { demoFilmPath } from "@/lib/paths";

// Fictional demo films only; live contracts use the canonical /watch/[chainId]/[campaign] route.
export default async function DemoWatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const film = getDemoFilm(slug);
  if (!film) notFound();
  return (
      <AppShell compact>
      <Link
        className="text-[#d3ed05] hover:text-[#e4ff1a] mb-4 inline-block text-sm font-bold"
        href={demoFilmPath(film.id)}
      >
        ← Back to campaign
      </Link>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
        <div>
          <div className="rounded-2xl border border-white/10 relative flex aspect-video max-h-[52vh] min-h-[240px] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_100%,#072733_0%,#04141c_55%,#01060f_100%)] p-6 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,.3)] [&_p]:text-white/70 [&_span]:text-xs [&_span]:font-bold [&_span]:tracking-[.2em] [&_span]:text-[#d3ed05] [&_strong]:mt-4 [&_strong]:text-xl">
            <span>FILM PREVIEW</span>
            <strong>Playback is coming soon</strong>
            <p>Secure viewing will be available when the film is released.</p>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold tracking-[.16em] text-[#d3ed05] uppercase">Featured film</p>
            <h1 className="!my-2">{film.title}</h1>
            <p>{film.description}</p>
          </div>
        </div>
        <div className="space-y-2">
        <aside className="rounded-2xl border border-white/10 bg-[#04141C] p-5 shadow-[0_18px_60px_rgba(0,0,0,.3)] [&_p]:text-sm [&_p]:text-white/70">
          <p className="text-[#d3ed05] text-xs font-bold !text-[#d3ed05]">Viewing access</p>
          <h2>Watch this film</h2>
          <p>Example price: {film.price} test USDC</p>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 text-xs font-bold text-white/60"
            disabled
          >
            Purchase access unavailable
          </button>
          <p className="mt-4 !text-xs">
            Wallet sign-in, payment and playback authorization are not
            connected. No access can be purchased in this preview.
          </p>
        </aside>
        </div>
      </div>
    </AppShell>
  );
}
