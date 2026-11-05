const STATS = [
  { value: "3", unit: "tranches", label: "planned production releases" },
  { value: "2", unit: "networks", label: "Arc and Arkiv" },
  { value: "6", unit: "decimals", label: "test USDC units" },
  { value: "0", unit: "mainnet", label: "testnet only" },
];

function StatCircle({
  value,
  unit,
  label,
}: {
  value: string;
  unit: string;
  label: string;
}) {
  return (
    <div className="relative flex size-[150px] flex-col items-center justify-center rounded-full border border-primary/30 bg-card/95 text-center sm:size-[180px] lg:size-[196px]">
      <span
        aria-hidden="true"
        className="absolute inset-2 rounded-full border border-dashed border-border"
      />
      <p className="relative font-black text-4xl leading-none text-primary sm:text-5xl">
        {value}
        <span className="ml-1.5 text-[10px] font-bold tracking-[.12em] text-muted-foreground uppercase">
          {unit}
        </span>
      </p>
      <p className="relative mt-2 max-w-[120px] text-[11px] leading-4 text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function OrbitRings({ size, className }: { size: string; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none ${size} animate-spin [animation-duration:70s] motion-reduce:animate-none ${className ?? ""}`}
    >
      <div className="absolute inset-[6%] rounded-full border border-dashed border-border" />
      <div className="absolute inset-[20%] rounded-full border border-dashed border-border" />
      <div className="absolute inset-[34%] rounded-full border border-dashed border-border" />
      <div className="absolute inset-[48%] rounded-full border border-dashed border-border" />
      <div className="absolute inset-[62%] rounded-full border border-dashed border-border" />
    </div>
  );
}

export function LandingEconomy() {
  return (
    <section
      id="economy"
      className="relative scroll-mt-20 overflow-hidden border-t border-border bg-background px-[var(--landing-gutter)] py-24"
    >
      <div className="landing-enter mx-auto max-w-2xl text-center">
        <p className="mb-4 text-xs font-bold tracking-[.2em] text-primary uppercase">
          The flow at a glance
        </p>
        <h2 className="text-[clamp(34px,5vw,62px)] leading-[1.02] font-black tracking-[-.05em] text-foreground uppercase">
          One story,{" "}
          <span className="text-muted-foreground">every moving part.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-muted-foreground">
          CineVest separates settlement, discovery and viewing into clear roles
          while keeping them connected to the same campaign.
        </p>
      </div>

      <div className="relative mx-auto mt-16 hidden h-[580px] w-full max-w-[880px] lg:block">
        <div className="absolute inset-0 grid place-items-center">
          <OrbitRings size="size-[560px]" />
        </div>
        <div className="absolute top-1/2 left-1/2 w-[260px] -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-[10px] font-bold tracking-[.18em] text-primary uppercase">
            Shared journey
          </p>
          <p className="mt-2 text-2xl leading-tight font-black text-foreground uppercase">
            Pitch to premiere
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            The campaign stays at the centre of the frame.
          </p>
        </div>
        <div className="absolute top-6 left-8">
          <StatCircle {...STATS[0]} />
        </div>
        <div className="absolute top-6 right-8">
          <StatCircle {...STATS[1]} />
        </div>
        <div className="absolute bottom-6 left-8">
          <StatCircle {...STATS[2]} />
        </div>
        <div className="absolute right-8 bottom-6">
          <StatCircle {...STATS[3]} />
        </div>
      </div>

      <div className="relative mt-12 lg:hidden">
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <OrbitRings size="size-[300px]" />
        </div>
        <div className="relative grid grid-cols-2 justify-items-center gap-4">
          {STATS.map((stat) => (
            <StatCircle key={stat.label} {...stat} />
          ))}
        </div>
      </div>

      <p className="relative mx-auto mt-14 max-w-2xl text-center text-[11px] leading-5 text-muted-foreground/80">
        Planned testnet architecture. Provider-backed flows are under active
        development, and no real funds are involved.
      </p>
    </section>
  );
}
