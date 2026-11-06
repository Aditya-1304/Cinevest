"use client";

import TeamCard from '../custom/TeamCard';
import AnimatedText from '../ui/AnimatedText'
import { useInView } from 'motion/react';
import { useRef } from 'react'

const TeamSection = () => {

    const sectionRef = useRef(null);
    const sectionInView = useInView(sectionRef, {
        once: true,
        amount: 0.1,
        margin: "0px 0px -100px 0px"
    });
    return (
        <div className='relative bg-[#030e14] py-10'>
            <section ref={sectionRef} className='container mx-auto'>
                <div className="text-center xl:px-20 lg:mt-0">
                    <p className="text-[#D3eD05] text-lg font-medium mb-6 uppercase">
                        Team
                    </p>
                    <h2 className="text-4xl md:text-5xl xl:text-6xl text-white font-dela font-medium uppercase">
                        <AnimatedText
                            text="Meet the team"
                            staggerDelay={0.04}
                            isActive={sectionInView}
                        />
                    </h2>
                    <p className='font-light text-lg text-[#FFFFFF]/70 mt-5'>
                        The filmmakers behind this season's demo campaigns.
                        <br />
                        All profiles are fictional.
                    </p>
                </div>
                <div className='mt-5'>
                    <TeamCard />
                </div>

            </section >
        </div>
    )
}
export default TeamSection;