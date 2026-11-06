"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check, Database, KeyRound, Play, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";

/** One sponsor/track card: accent glow, real integration details and a small live-style visual. */
type TrackProps = {
    index: string;
    role: string;
    title: ReactNode;
    blurb: string;
    accent: string; // css color for glow + chips
    logo: ReactNode;
    points: string[];
    proof: string[];
    visual: ReactNode;
    className?: string;
    delay?: number;
};

const Track = ({ index, role, title, blurb, accent, logo, points, proof, visual, className = "", delay = 0 }: TrackProps) => (
    <motion.article
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.6, ease: "easeOut", delay }}
        style={{ ["--accent" as string]: accent }}
        className={`group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#04141C] p-6 transition duration-300 hover:-translate-y-1 hover:border-white/30 md:p-8 ${className}`}
    >
        {/* accent glow + faint grid, purely decorative */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full opacity-25 blur-3xl transition-opacity duration-500 group-hover:opacity-50" style={{ background: accent }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-size-[32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />

        <div className="relative flex items-start justify-between gap-4">
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold tracking-[.14em] uppercase" style={{ borderColor: `${accent}66`, color: accent }}>
                <span className="font-dela">{index}</span>
                {role}
            </span>
            <div className="flex h-9 items-center">{logo}</div>
        </div>

        <h3 className="relative mt-6 font-dela text-2xl leading-tight text-white uppercase md:text-3xl">{title}</h3>
        <p className="relative mt-3 max-w-xl text-sm leading-relaxed text-white/70">{blurb}</p>

        <ul className="relative mt-5 mb-6 grid gap-2.5 text-sm text-white/80">
            {points.map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0" style={{ color: accent }} aria-hidden />
                    <span>{point}</span>
                </li>
            ))}
        </ul>

        <div className="relative mt-auto rounded-2xl border border-white/10 bg-black/30 p-4">{visual}</div>

        <div className="relative mt-5 flex flex-wrap gap-2">
            {proof.map((item) => (
                <span key={item} className="rounded-md border border-white/10 bg-white/[.04] px-2.5 py-1 font-mono text-[11px] text-white/70">
                    {item}
                </span>
            ))}
        </div>
    </motion.article>
);

const SwarmMark = () => (
    <span className="inline-flex items-center gap-2 font-dela text-xl text-white">
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="#ff8a3d" strokeWidth="1.6" aria-hidden>
            <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" />
            <path d="M12 2.5v19M4 7l16 10M20 7 4 17" opacity=".45" />
        </svg>
        swarm
    </span>
);

const ChainlinkMark = () => (
    <span className="inline-flex items-center gap-2 font-dela text-xl text-white">
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="#93c5fd" strokeWidth="2" aria-hidden>
            <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" />
        </svg>
        chainlink
    </span>
);

const Logo = ({ src, alt, invert = false }: { src: string; alt: string; invert?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={`h-7 w-auto max-w-[120px] ${invert ? "brightness-0 invert" : ""}`} />
);

const Tranches = () => (
    <div>
        <p className="mb-2 flex justify-between text-[11px] tracking-wide text-white/50 uppercase">
            <span>Escrow released by milestone</span>
            <span>5.0 USDC goal</span>
        </p>
        <div className="flex h-3 overflow-hidden rounded-full text-[0px]" role="img" aria-label="Three tranches: 30%, 40% and 30%">
            <div className="w-[30%] bg-[#d3ed05]" />
            <div className="w-[40%] bg-[#d3ed05]/60" />
            <div className="w-[30%] bg-[#d3ed05]/30" />
        </div>
        <div className="mt-2 grid grid-cols-[30fr_40fr_30fr] text-[11px] text-white/60">
            <span>30% start</span>
            <span>40% rough cut</span>
            <span>30% final</span>
        </div>
    </div>
);

const EntitySnippet = () => (
    <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-white/70">
        <span className="text-[#5eead4]">Cinevest.film.v1</span>
        {" {\n  "}
        <span className="text-white/45">campaignAddress</span>: <span className="text-[#d3ed05]">0x7250…a9c7</span>
        {",\n  "}
        <span className="text-white/45">creatorAddress</span>: <span className="text-[#d3ed05]">owner wallet</span>
        {",\n  "}
        <span className="text-white/45">genre</span>: <span className="text-[#d3ed05]">&quot;Drama&quot;</span> <span className="text-white/35">{"// indexed"}</span>
        {"\n}"}
    </pre>
);

const SwarmRef = () => (
    <div className="grid gap-2 font-mono text-[11px]">
        <div className="flex items-center justify-between gap-3">
            <span className="text-white/45">pitchReference</span>
            <span className="truncate text-[#ff8a3d]">0xf4c3…8111</span>
        </div>
        <div className="flex items-center justify-between gap-3">
            <span className="text-white/45">on Arc</span>
            <span className="truncate text-white/70">0xf4c3…8111</span>
        </div>
        <div className="flex items-center gap-2 text-[#d3ed05]">
            <ShieldCheck className="size-4" aria-hidden /> digest matches, bytes served
        </div>
    </div>
);

const ReleaseFlow = () => (
    <ol className="grid grid-cols-3 gap-2 text-center text-[11px] text-white/70">
        {[
            ["1", "Read", "Arc commitments"],
            ["2", "Check", "Mux readiness"],
            ["3", "Review", "human approval"],
        ].map(([n, a, b]) => (
            <li key={n} className="rounded-xl border border-white/10 bg-white/[.03] px-2 py-3">
                <span className="mx-auto mb-1.5 grid size-6 place-items-center rounded-full bg-white/90 font-dela text-xs text-black">{n}</span>
                <span className="block font-bold text-white">{a}</span>
                {b}
            </li>
        ))}
    </ol>
);

const infra = [
    { icon: Play, name: "Mux", text: "Signed playback, or pay as you watch from refundable escrow" },
    { icon: Database, name: "Postgres", text: "Resumable, idempotent publish journal" },
    { icon: KeyRound, name: "SIWE", text: "One sign-in for uploads, publishing, viewing" },
];

const FeatureCard = () => (
    <div className="grid grid-cols-1 gap-5 px-4 md:px-10 lg:grid-cols-12 lg:px-20 xl:px-40">
        <Track
            className="lg:col-span-7"
            index="01"
            role="Settlement"
            accent="#d3ed05"
            logo={<Logo src="/landing/logos/arc.svg" alt="Arc" />}
            title={<>Settled on<br />Arc Testnet</>}
            blurb="Every contribution, view purchase and payout is a test USDC transaction on Circle's Arc network. The contract, not a server, decides who gets paid."
            points={[
                "Funds sit in escrow and release in three milestone tranches",
                "Missed goal? Backers refund their exact principal",
                "Viewing revenue splits pro rata, with a hard repayment cap",
            ]}
            visual={<Tranches />}
            proof={["Chain 5042002", "Factory 0x7250…a9c7", "Test USDC (6 dec)"]}
        />
        <Track
            className="lg:col-span-5"
            index="02"
            role="Discovery"
            accent="#5eead4"
            logo={<Logo src="/landing/logos/arkiv.svg" alt="Arkiv" invert />}
            title={<>Discoverable<br />on Arkiv</>}
            blurb="Creators list their own film from their own wallet. Anyone can query it, no Cinevest database required."
            points={[
                "Creator-owned entities that expire unless renewed",
                "Filter by genre or owner; cross-checked against Arc",
                "Independent read-only explorer at /explorer",
            ]}
            visual={<EntitySnippet />}
            proof={["Rabdi testnet", "Cinevest.film.v1"]}
            delay={0.1}
        />
        <Track
            className="lg:col-span-5"
            index="03"
            role="Storage"
            accent="#ff8a3d"
            logo={<SwarmMark />}
            title={<>Pinned<br />on Swarm</>}
            blurb="Posters, pitches and milestone evidence live on Swarm. Their digests are committed on Arc, so swapped bytes are rejected."
            points={[
                "Content-addressed references anyone can re-fetch",
                "Backend verifies every byte against the Arc commitment",
                "Postage batch and Bee node run from one compose file",
            ]}
            visual={<SwarmRef />}
            proof={["Bee node", "Redundancy 0 /bytes"]}
            delay={0.1}
        />
        <Track
            className="lg:col-span-7"
            index="04"
            role="Release readiness"
            accent="#93c5fd"
            logo={<ChainlinkMark />}
            title={<>Ready for<br />release</>}
            blurb="A Chainlink CRE workflow checks Arc commitments and Mux delivery before the independent reviewer approves the final milestone."
            points={[
                "Combines on-chain state with an external media system",
                "Read-only Mux access, with no signing key in the workflow",
                "Checks delivery only; a human still judges the film",
            ]}
            visual={<ReleaseFlow />}
            proof={["CRE CLI simulation", "Arc + Mux"]}
            delay={0.2}
        />

        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid gap-4 rounded-3xl border border-white/10 bg-[#072733] p-6 md:p-8 lg:col-span-12 lg:grid-cols-[1fr_auto] lg:items-center"
        >
            <div className="grid gap-5 md:grid-cols-3">
                {infra.map(({ icon: Icon, name, text }) => (
                    <div key={name} className="flex items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-[#d3ed05]">
                            <Icon className="size-4" aria-hidden />
                        </span>
                        <p className="text-sm leading-relaxed text-white/70">
                            <strong className="block text-white">{name}</strong>
                            {text}
                        </p>
                    </div>
                ))}
            </div>
            <Link
                href="/create"
                className="inline-flex w-fit items-center gap-3 rounded-xl bg-[#d3ed05] px-6 py-4 font-bold tracking-tight text-black transition-transform hover:scale-105"
            >
                Open campaign setup
                <ArrowRight className="size-5" aria-hidden />
            </Link>
        </motion.div>
    </div>
);

export default FeatureCard;
