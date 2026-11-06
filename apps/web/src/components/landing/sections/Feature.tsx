"use client";
import FeatureCard from '../custom/FeatureCard';
import AnimatedText from '../ui/AnimatedText'
import { useInView } from 'motion/react';
import { useRef } from 'react'

const Feature = () => {

    const sectionRef = useRef(null);
    const sectionInView = useInView(sectionRef, {
        once: true,
        amount: 0.1,
        margin: "0px 0px -100px 0px"  // Triggers 100px before element enters viewport
    });

    return (
        <div className='relative bg-[#030e14] py-10'>
            <section ref={sectionRef} className='container mx-auto'>
                <div className="text-center xl:px-20 lg:mt-20">
                    <p className="text-[#D3eD05] text-lg font-medium mb-6 uppercase">
                        Features
                    </p>
                    <h2 className="text-4xl md:text-5xl xl:text-6xl text-white font-dela font-medium uppercase">
                        <AnimatedText
                            text="Built On Open Rails"
                            staggerDelay={0.04}
                            isActive={sectionInView}
                        />
                    </h2>
                    <p className='font-light text-lg text-[#FFFFFF]/70 mt-5'>
                        Arc for settlement, Arkiv for discovery, Swarm for storage
                        <br />
                        and World ID for verified humans: the stack behind every campaign.
                    </p>
                </div>
                <div className='mt-10 overflow-hidden'>
                    <FeatureCard />
                </div>
            </section>

        </div>
    )
}

export default Feature