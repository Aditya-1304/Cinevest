'use client'
import React, { useRef } from 'react'
import CTAImage from '../../../../public/landing/Ctabg.svg'
import Image from 'next/image'
import AnimatedText from '../ui/AnimatedText'
import { useInView } from 'motion/react'
const Ninja1 = "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=75";
const Ninja2 = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&w=800&q=75";

const CtaSection = () => {

    const sectionRef = useRef(null);
    const sectionInView = useInView(sectionRef, {
        once: true,
        amount: 0.1,
        margin: "0px 0px -100px 0px"
    });
    return (
        <div ref={sectionRef} className='relative bg-[#030e14] py-10 overflow-x-hidden'>
            <section className='container mx-auto px-4'>

                <div className='relative w-full h-[500px] md:h-[550px] lg:h-[600px] rounded-lg   overflow-hidden lg:flex lg:flex-col justify-between'>
                    <Image
                        src={CTAImage}
                        alt='CTAimage'
                        fill
                        className='object-cover'
                        priority
                    />

                    {/* Content overlay - Top Centered on mobile, Left on large */}
                    <div className='absolute inset-0 flex items-start justify-center lg:justify-start pt-12 md:pt-16 lg:items-center lg:pt-0'>
                        <div className='flex flex-col space-y-4 px-8 lg:px-12 xl:px-16 text-center lg:text-left max-w-xl lg:max-w-lg relative z-20'>
                            <p className="text-[#D3eD05] text-sm md:text-base font-bold uppercase tracking-wider">
                                Get Started
                            </p>
                            <h2 className="text-white font-dela font-black uppercase leading-tight text-3xl md:text-4xl lg:text-5xl">
                                <AnimatedText
                                    text="Back A Film Today!"
                                    staggerDelay={0.04}
                                    isActive={sectionInView}
                                />
                            </h2>
                            <p className='font-light text-[#FFFFFF] text-base md:text-lg'>
                                Join the cinevest community to meet filmmakers,
                                follow campaigns and get early updates.
                            </p>
                            <div>
                                <button className='inline-flex bg-[#d3ed05] text-black px-6 md:px-8 py-3 md:py-4 rounded-lg font-bold tracking-tight hover:bg-[#b8d004] transition-colors text-sm md:text-base'>
                                    Join The Community
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Ninja Images - Bottom Centered on mobile, Right side on large */}
                    <div className='absolute bottom-0 left-0 w-full lg:w-auto lg:right-0 lg:left-auto flex items-end justify-center lg:justify-end z-10 pointer-events-none mb-[-20px] md:mb-[-30px]'>
                        {/* Ninja 1 (Blue - Left/Back) */}
                        <div className="relative w-[300px] h-[300px] md:w-[340px] md:h-[340px] lg:w-[300px] lg:h-[300px] -mr-38 top-28 md:-mr-52 md:top-28 lg:top-0 lg:top-[150px] lg:right-4">
                            <Image
                                src={Ninja2}
                                alt='Film still'
                                fill
                                sizes='(min-width: 1024px) 320px, 300px'
                                className='object-cover rounded-3xl'
                            />
                        </div>

                        {/* Ninja 2 (Green - Right/Front) */}
                        <div className="relative w-[280px] h-[280px] md:w-[340px] md:h-[340px] lg:w-[320px] lg:h-[320px] top-17 md:top-13 lg:top-0  lg:top-[100px]">
                            <Image
                                src={Ninja1}
                                alt='Film poster'
                                fill
                                sizes='(min-width: 1024px) 320px, 300px'
                                className='object-cover rounded-3xl'
                            />
                        </div>
                    </div>
                </div>

            </section>
        </div>
    )
}

export default CtaSection