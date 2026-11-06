'use client';
import { motion } from "motion/react";
import Image from 'next/image'
import { ArrowRight } from 'lucide-react';
import type { DemoFilm } from '@/lib/demo-films';


interface AboutCardProps {
    film: DemoFilm;
    tiltDeg: number
}

const AboutCard = ({ film, tiltDeg }: AboutCardProps) => {
    return (
        // border-[#ffff0633]
        <motion.div
            whileHover={{ rotate: tiltDeg }}
            transition={{ type: "spring", stiffness: 100, damping: 10 }}
            className="relative border border-[#d9d9d980] rounded-[48px] p-3 md:w-[365px] h-[423px]">
            <Image
                src={film.poster}
                alt={`${film.title} poster`}
                loading="eager"
                width={341}
                height={399}
                className="w-full h-full rounded-[48px] object-cover"
            />

            <span className="absolute top-8 left-8 rounded-full bg-black/60 backdrop-blur-md px-4 py-2 font-dela text-sm uppercase text-white">
                {film.title}
            </span>

            {/* shadow bar */}
            <div className="
        absolute 
        bottom-8 
        left-7 right-7
        bg-transparent 
        backdrop-blur-md 
        py-5 
        border border-[#d3ed05] 
        shadow-[0_6px_18px_rgba(220,255,0,0.18)] 
        rounded-4xl
    ">
                <div className="flex flex-row justify-between items-center px-4">
                    <div className='flex flex-col'>
                        <span className='font-inter font-medium text-sm'>{film.status} · {film.genre}</span>
                        <span className='text-base font-light font-dela'>{film.raised} / {film.goal} USDC</span>
                    </div>
                    <span className='bg-[#d3ed05] rounded-full'>
                        <ArrowRight className='text-black w-13 h-13' />
                    </span>
                </div>
            </div>
        </motion.div>
    )
}

export default AboutCard