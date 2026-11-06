"use client";
import CountUp from "../custom/Countup";
import NFTcard from "../custom/NFTcard"
import heroCharacter from "../../../../public/landing/hero-character.png"
import grassImage from '../../../../public/landing/grass.png'
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import Link from "next/link";

const Hero = () => {
    const sectionRef = useRef(null);

    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start end", "end start"]
    });
    const translateY = useSpring(
        useTransform(scrollYProgress, [0, 1], [60, -60]),
        { stiffness: 120, damping: 25 }
    );

    return (<>

        <section ref={sectionRef} className='relative py-15 bg-[linear-gradient(to_bottom,rgba(5,7,13,0.95),rgba(19,58,88,0.85),rgba(38,130,80,0.8),rgba(200,255,0,0.6))] h-full'>
            <div className='container mx-auto px-4'>
                <div className='flex flex-col items-center gap-7 mb-10'>
                    <h1 className='uppercase text-[40px] md:text-5xl lg:text-7xl font-dela font-bold text-center leading-tight sm:leading-none mt-5'>
                        <span className='block'>Stories worth</span>
                        <span className='block md:inline'>
                            <span>backing.</span>
                        </span>
                    </h1>
                    <p className='font-light text-lg text-center text-[#FFFFFF]/70 mt-5'>
                        <span className='block'>
                            CineVest is a testnet prototype for transparent film funding and
                        </span>
                        <span className='block'>
                            pay-per-view settlement. Follow a story from campaign terms to the final frame.
                        </span>
                    </p>
                    <Link href="/discover" className='bg-[#d3ed05] text-black px-5 py-3 rounded-lg font-bold tracking-tight'>
                        Explore all films
                    </Link>
                </div>

                {/* Cards container */}
                <div className="relative flex flex-col items-center gap-8 md:flex-row md:items-stretch md:justify-center xl:justify-between">

                    {/* left card  */}
                    <div className="flex flex-col items-center justify-center md:w-[45%] xl:w-[40%]">
                        <NFTcard imageSrc="card1" imageAlt="The Last Monsoon poster" rarityScore={8.7} />
                        <div className="text-left space-y-4 mt-4">
                            <h2 className="font-dela text-3xl">
                                <span>The Last Monsoon</span>
                            </h2>
                            <p className="font-medium text-lg">
                                A fisherman&apos;s daughter chases a storm
                                <br />
                                that could save or sink her village.
                            </p>
                        </div>
                    </div>

                    {/* Right details  */}
                    <div className="p-6 rounded-3xl bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.05)_100%)] backdrop-blur-sm flex flex-col justify-center gap-8 md:gap-18 md:w-[45%] xl:w-[35%]">
                        <div>
                            <h1 className="flex flex-col">
                                <span className="text-5xl font-dela">
                                    <CountUp
                                        to={12}
                                        startWhen={true}
                                    />+
                                </span>
                                <span className="text-xl font-light opacity-80">
                                    Independent films in funding
                                </span>
                            </h1>
                        </div>

                        <div>
                            <h1 className="flex flex-col">
                                <span className="text-5xl font-dela"><CountUp
                                    to={48}
                                    startWhen={true}
                                /> Hrs</span>
                                <span className="text-xl font-light opacity-80">
                                    To fund a campaign goal
                                </span>
                            </h1>
                        </div>

                        <div>
                            <h1 className="flex flex-col">
                                <span className="text-5xl font-dela">150%</span>
                                <span className="text-xl font-light opacity-80">
                                    Backer repayment cap
                                </span>
                            </h1>
                        </div>
                    </div>

                </div>
            </div>

            {/* Hero Ninja Image */}
            <div className="flex justify-center px-4 mt-8 xl:absolute xl:left-1/2 xl:-translate-x-1/2 xl:-bottom-30 xl:mt-10 pt-20 xl:z-10">
                <motion.img
                    src={heroCharacter.src}
                    alt="Cinevest cinema-camera mascot"
                    className="h-[clamp(420px,53vw,660px)] w-auto max-w-full"
                    style={{
                        translateY
                    }}
                />
            </div>
        </section>
        <div className="bg-[rgba(200,255,0,0.6)] z-10">
            <motion.img
                className=" w-full h-full"
                src={grassImage.src}
                alt="Grass Image"
            />
        </div>
    </>
    )
}

export default Hero