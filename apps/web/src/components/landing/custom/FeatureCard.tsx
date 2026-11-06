"use client";
import { ArrowRight } from "lucide-react";
import { motion, type Variants } from "motion/react";

const slideInFromTopLeft = {
    initial: { opacity: 0, x: -50, y: -50 },
    animate: {
        opacity: 1,
        x: 0,
        y: 0,
        transition: { duration: 0.6, ease: "easeOut" }
    }
} satisfies Variants;

const slideInFromRight = {
    initial: { opacity: 0, x: 50 },
    animate: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.6, ease: "easeOut" }
    }
} satisfies Variants;

const slideInFromBottomLeft = {
    initial: { opacity: 0, x: -50, y: 50 },
    animate: {
        opacity: 1,
        x: 0,
        y: 0,
        transition: { duration: 0.6, ease: "easeOut" }
    }
} satisfies Variants;

// NEW VARIANT: Pure Bottom-to-Top Animation
const slideInFromBottom = {
    initial: { opacity: 0, y: 50 }, // No X movement, just Y
    animate: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: "easeOut" }
    }
} satisfies Variants;

const LogoPanel = ({ src, alt, invert = false, items }: { src: string; alt: string; invert?: boolean; items: string[] }) => (
    <div className="mx-6 md:mx-10 mt-8 mb-6 md:mb-10 rounded-2xl border border-white/10 bg-[#030e14] p-6 flex flex-col items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={`h-12 md:h-14 w-auto max-w-full ${invert ? "brightness-0 invert" : ""}`} />
        <ul className="flex flex-wrap justify-center gap-2">
            {items.map((item) => (
                <li key={item} className="rounded-full border border-[#d3ed05]/40 px-3 py-1 text-xs text-white/80">{item}</li>
            ))}
        </ul>
    </div>
);

const FeatureCard = () => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-10 gap-5 p-5 px-4 md:px-10 lg:px-20 xl:px-40">

            {/* CARD 1 (Top Left) */}
            <motion.div
                className="lg:row-span-5 bg-[#04141C] flex flex-col justify-between overflow-hidden rounded-3xl"
                variants={slideInFromTopLeft}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true, amount: 0.2 }}
            >
                <div className='text-left p-6 md:p-10 pb-0'>
                    <h2 className='text-3xl md:text-4xl font-dela font-bold text-white uppercase'>
                        Settled On
                        <br />
                        Arc Testnet
                    </h2>
                    <p className='font-light text-sm text-[#FFFFFF]/70 mt-5'>
                        Every contribution, view purchase and payout is a
                        <br />
                        test USDC transaction on Circle&apos;s Arc network.
                    </p>
                </div>
                <LogoPanel src="/landing/logos/arc.svg" alt="Arc" items={["Test USDC", "Campaign factory", "Chain 5042002"]} />
            </motion.div>

            {/* CARD 2 (Right Tall) */}
            <motion.div
                className="lg:row-span-7 bg-[#04141C] flex flex-col overflow-hidden rounded-3xl"
                variants={slideInFromRight}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: 0.1 }}
            >
                <div className='text-left p-6 md:p-10 pb-0'>
                    <h2 className='text-3xl md:text-4xl font-dela font-bold text-white uppercase'>
                        Discoverable
                        <br />
                        On Arkiv
                    </h2>
                    <p className='font-light text-md text-[#FFFFFF]/70 mt-5 leading-relaxed'>
                        Campaign listings are published to Arkiv as
                        <br />
                        public entities, so anyone can query and find
                        <br />
                        films beyond a single app.
                    </p>
                </div>
                <div className="mt-auto">
                    <LogoPanel src="/landing/logos/arkiv.svg" alt="Arkiv" items={["Public campaign listings", "Queryable by anyone", "No single-app lock-in"]} />
                </div>
            </motion.div>

            {/* CARD 3 (Bottom Left) */}
            <motion.div
                className="lg:row-span-5 lg:row-start-6 bg-[#04141C] flex flex-col justify-between overflow-hidden rounded-3xl"
                variants={slideInFromBottomLeft}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: 0.2 }}
            >
                <div className='text-left p-6 md:p-10 pb-0'>
                    <h2 className='text-3xl md:text-4xl font-dela font-bold text-white uppercase'>
                        One Human,
                        <br />
                        One Vote
                    </h2>
                    <p className='font-light text-md text-[#FFFFFF]/70 mt-5 leading-relaxed'>
                        Creators can gate a campaign with World ID so
                        <br />
                        each verified human backs once, not a bot farm.
                    </p>
                </div>
                <LogoPanel src="/landing/logos/world.svg" alt="World ID" invert items={["Proof of personhood", "Per-human limits", "Optional gating"]} />
            </motion.div>

            {/* CARD 4 (Bottom Right - Call to Action) */}
            <motion.div
                className="lg:row-span-3 lg:col-start-2 lg:row-start-8 bg-[#072733] flex flex-col justify-between rounded-3xl p-6 md:p-10"
                /* UPDATED: Uses the new pure bottom-to-top variant */
                variants={slideInFromBottom}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: 0.3 }}
            >
                <div className='text-left'>
                    <h2 className='text-3xl md:text-4xl font-dela font-bold text-white uppercase leading-tight'>
                        Ready To Back
                        <br />
                        A Film?
                    </h2>
                    <p className='font-light text-md text-[#FFFFFF]/70 mt-5 leading-relaxed'>
                        Explore the testnet demo or open a campaign.
                        <br />
                        All examples are fictional; no real funds are involved.
                    </p>
                </div>
                <div className="pt-8">
                    <button className='bg-[#d3ed05] hover:scale-105 transition-transform text-black px-6 py-4 rounded-xl font-bold tracking-tight flex items-center gap-3 w-fit'>
                        Open campaign setup
                        <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            </motion.div>
        </div>
    )
}

export default FeatureCard