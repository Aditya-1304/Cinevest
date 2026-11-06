'use client';
import React from 'react'
import Image from 'next/image'
const TestImage = "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=700&q=75";
import { ArrowRight } from 'lucide-react';


interface NFTcardProps {
    imageSrc: string;
    imageAlt: string;
    rarityScore: number;
}

const NFTcard = ({ imageSrc, imageAlt, rarityScore }: NFTcardProps) => {
    return (
        // border-[#ffff0633]
        <div className="relative border border-[#d9d9d980] rounded-[48px] p-3 md:w-[348px] h-[413px]">
            <Image
                src={TestImage}
                alt="Film poster"
                width={324}
                height={389}
                className="w-full h-full rounded-[40px] object-cover"
            />

            {/* shadow bar */}
            <div className="
        absolute 
        bottom-8 
        left-7 right-7
        bg-transparent 
        backdrop-blur-md 
        py-5 
        border-2 border-[#d3ed05] 
        shadow-[0_6px_18px_rgba(220,255,0,0.18)] 
        rounded-4xl
    ">
                <div className="flex flex-row justify-between items-center px-4">
                    <div className='flex flex-col'>
                        <span className='font-inter font-extrabold text-lg'>Funded: </span>
                        <span className='text-xl font-dela'>52%</span>
                    </div>
                    <span className='bg-[#d3ed05] rounded-full'>
                        <ArrowRight className='text-black w-13 h-13' />
                    </span>
                </div>
            </div>
        </div>
    )
}

export default NFTcard