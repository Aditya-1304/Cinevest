import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="overflow-hidden bg-primary px-[var(--landing-gutter,6%)] pt-12 text-primary-foreground min-[521px]:pt-[72px] [&_a:focus-visible]:outline-3 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-primary-foreground">
      <div className="grid grid-cols-1 gap-10 text-primary-foreground min-[801px]:grid-cols-[3fr_1fr] min-[801px]:gap-12">
        <nav
          className="grid grid-cols-2 gap-x-6 gap-y-[30px] min-[521px]:grid-cols-3 [&_a]:text-xs [&_a]:font-bold [&_a:hover]:underline [&_a:hover]:underline-offset-4 [&_div]:flex [&_div]:flex-col [&_div]:items-start [&_div]:gap-[14px] min-[521px]:[&_div]:gap-5"
          aria-label="Footer navigation"
        >
          <div>
            <Link href="/#discover">Discover films</Link>
            <Link href="/#features">Features</Link>
            <Link href="/demo">Explore the demo</Link>
          </div>
          <div>
            <Link href="/create">Create a campaign</Link>
            <Link href="/dashboard/creator">Creator dashboard</Link>
            <Link href="/dashboard/backer">Backer dashboard</Link>
          </div>
          <div>
            <Link href="/film/the-last-monsoon">Funding example</Link>
            <Link href="/film/after-the-lights">Released film</Link>
            <Link href="/watch/after-the-lights">Watch preview</Link>
          </div>
        </nav>
        <div className="max-w-[440px] [&>p]:mb-5 [&>p]:max-w-[300px] [&>p]:text-sm [&>p]:leading-[1.6] [&>p]:font-semibold [&>small]:mt-[18px] [&>small]:block [&>small]:max-w-[310px] [&>small]:text-[11px] [&>small]:leading-[1.6] [&>small]:text-primary-foreground/70">
          <p>
            Independent stories are better together. Discover a new way to bring
            films to life.
          </p>
          <Link
            href="/create"
            className="inline-flex items-center gap-5 rounded-md bg-primary-foreground px-[18px] py-[14px] text-xs font-bold text-primary hover:bg-primary-foreground/90"
          >
            Start a campaign <span aria-hidden="true">↗</span>
          </Link>
          <small>
            Testnet demo. Test USDC has no monetary value; returns are not
            guaranteed.
          </small>
        </div>
      </div>
      <div
        className="mt-[55px] mr-[-.045em] ml-[-.045em] pb-[.08em] text-[19vw] leading-[.95] font-bold tracking-[-.085em] whitespace-nowrap min-[521px]:mt-[70px] min-[801px]:mt-[92px] min-[801px]:text-[clamp(80px,19.5vw,360px)] [&>span]:text-primary-foreground/40"
        aria-hidden="true"
      >
        cinevest<span>.</span>
      </div>
    </footer>
  );
}
