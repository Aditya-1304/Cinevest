"use client";
import AnimatedText from '../ui/AnimatedText'
import { useInView, Variants } from 'motion/react';
import Image from 'next/image';
import { useRef } from 'react'
import ScorpImage from "../../../../public/landing/corps.png";
const EcoNinja = "/landing/camera.svg";
import { motion } from "motion/react";
import DarkCircle from '../ui/DarkCircle';

export const imageZoomIn = {
    initial: { scale: 1.25 },
    animate: {
        scale: 1,
        transition: { type: "spring", stiffness: 90, damping: 15 },
    },
} satisfies Variants;

const Economy = () => {
    const sectionRef = useRef(null);
    const sectionInView = useInView(sectionRef, {
        once: true,
        amount: 0.1,
        margin: "0px 0px -100px 0px"
    });

    return (
        <div className='relative bg-[#030e14] py-10 pb-40 md:pb-60 h-full w-full box-border overflow-x-hidden'>
            <section ref={sectionRef} className='container mx-auto px-4'>
                <div className="text-center xl:px-20 lg:mt-20">
                    <p className="text-[#D3eD05] text-lg font-medium mb-6 uppercase">
                        film economy
                    </p>
                    <h2 className="text-4xl md:text-5xl xl:text-6xl text-white font-dela font-medium uppercase">
                        <AnimatedText
                            text="The Film Economy"
                            staggerDelay={0.04}
                            isActive={sectionInView}
                        />
                    </h2>
                    <p className='font-light text-lg text-[#FFFFFF]/70 mt-5'>
                        A transparent flow from backer contributions to production tranches and viewing revenue.
                    </p>
                </div>

                {/* Desktop Layout */}
                <div className='hidden md:block relative mt-20 w-fit mx-auto max-w-full'>
                    {/* LAYER 1: The Spinning Background */}
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                        style={{ willChange: "transform" }}
                        className="relative z-0 mx-auto"
                    >
                        <Image
                            src={ScorpImage}
                            alt="Spinning Background"
                            width={750}
                            height={750}
                            priority
                            className="max-w-full h-auto"
                        />
                    </motion.div>

                    {/* LAYER 2: Ninja Overlay */}
                    <motion.div
                        variants={imageZoomIn}
                        initial="initial"
                        animate="animate"
                        className="absolute z-30 w-[320px] h-auto pointer-events-none 
                        left-1/2 -translate-x-1/2 
                        top-1/2 -translate-y-1/2">

                    </motion.div>

                    {/* LAYER 3: Dark Circles */}
                    <div className="absolute z-20 top-70 left-10">
                        <DarkCircle percent={70} text='Backer share' unit='%' />
                    </div>
                    <div className="absolute z-20 top-70 right-10">
                        <DarkCircle percent={30} text='Production tranches' unit='%' />
                    </div>
                    <div className="absolute z-20 -bottom-30 left-10">
                        <DarkCircle percent={2.5} text='Price per view' unit='USDC' />
                    </div>
                    <div className="absolute z-20 -bottom-30 right-10">
                        <DarkCircle percent={3} text='Films in demo' unit='films' />
                    </div>
                </div>

                {/* Mobile Layout - Added overflow-hidden to prevent x-axis bleed */}
                <div className='md:hidden mt-10 flex flex-col items-center w-full overflow-hidden'>
                    <div className='relative w-full aspect-square max-w-[320px] mx-auto flex justify-center items-center overflow-hidden'>
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                            className="relative z-0 w-full h-full"
                        >
                            <Image
                                src={ScorpImage}
                                alt="Spinning Background"
                                width={400}
                                height={400}
                                className="w-full h-full object-contain"
                            />
                        </motion.div>

                        <motion.div
                            variants={imageZoomIn}
                            initial="initial"
                            animate="animate"
                            className="absolute z-20 w-[80%] h-auto pointer-events-none left-1/2 -translate-x-1/2 top-[60%] -translate-y-1/2">
                            <Image
                                src={EcoNinja}
                                unoptimized
                                alt='Cinema camera'
                                width={280}
                                height={280}
                                className="object-contain w-full h-auto drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
                            />
                        </motion.div>
                    </div>

                    <div className='flex flex-col items-center gap-6 mt-12 w-full max-w-full'>
                        <DarkCircle percent={70} text='Backer share' unit='%' />
                        <DarkCircle percent={30} text='Production tranches' unit='%' />
                        <DarkCircle percent={2.5} text='Price per view' unit='USDC' />
                        <DarkCircle percent={3} text='Films in demo' unit='films' />
                    </div>
                </div>
            </section>
        </div>
    )
}

export default Economy;