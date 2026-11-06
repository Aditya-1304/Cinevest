'use client';
import { useRef } from 'react';
import { useInView } from 'motion/react';
import AnimatedText from '../ui/AnimatedText';
import AboutCard from '../custom/AboutCard';
import { demoFilms } from '@/lib/demo-films';

const About = () => {
    const sectionRef = useRef(null);
    const secondTextRef = useRef(null);
    // Trigger when just 10% of section is visible, with 100px margin to start earlier
    const sectionInView = useInView(sectionRef, {
        once: true,
        amount: 0.1,
        margin: "0px 0px -100px 0px"  // Triggers 100px before element enters viewport
    });

    const secondTextview = useInView(secondTextRef, {
        once: true,
        amount: 0.1,
        margin: "0px 0px -100px 0px"  // Triggers 100px before element enters viewport
    });

    return (
        <div className="relative bg-[#030e14] py-10">
            <section ref={sectionRef} className="container mx-auto px-4">
                <div className="text-center xl:px-20 lg:mt-20">
                    <p className="text-[#D3eD05] text-xl font-medium mb-6 uppercase">
                        About cinevest
                    </p>
                    <h2 className="text-3xl md:text-5xl xl:text-6xl text-white font-dela font-medium uppercase">
                        <AnimatedText
                            text="cinevest is a home for independent films and their backers."
                            highlightText="their backers."
                            highlightClassName="text-[#FFFFFF80]"
                            staggerDelay={0.04}
                            isActive={sectionInView}
                        />
                    </h2>
                </div>

                <div className='mt-15 lg:mt-25 flex flex-col lg:flex-row items-center justify-center gap-10'>
                    {demoFilms.map((film, i) => (
                        <AboutCard key={film.id} film={film} tiltDeg={i % 2 ? -10 : 10} />
                    ))}
                </div>

                <div className="text-center xl:px-20 mt-25" ref={secondTextRef}>
                    <h2 className="text-4xl md:text-5xl xl:text-6xl text-white font-dela font-medium uppercase">
                        <AnimatedText
                            text="Every film is funded in milestones, with returns capped and paid out in the open."
                            highlightText="with returns capped and paid out in the open."
                            highlightClassName="text-[#FFFFFF80]"
                            staggerDelay={0.04}
                            isActive={secondTextview}  // Changed from sectionInView to secondTextview
                        />
                    </h2>
                </div>
            </section>
        </div>
    );
};

export default About;