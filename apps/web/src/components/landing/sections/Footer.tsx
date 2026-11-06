"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Twitter, Facebook, Instagram, Linkedin, ArrowUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

const Footer = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => {
            setVisible(window.scrollY > 300);
        };

        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    return (
        <footer className="relative bg-[#050b0d] text-gray-400 font-inter overflow-hidden border-t border-white/5">


            <div className="container mx-auto px-4 relative z-10">

                {/* 2. Above Footer Back to Top Section */}
                <div className="flex flex-col items-center justify-center pt-12 pb-8">
                    <button
                        onClick={scrollToTop}
                        className="group flex flex-row items-center  transition-colors text-white"
                    >
                        <motion.div
                            animate={{ y: [0, -8, 0] }}
                            transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                            className="flex h-10 w-10 items-center justify-center rounded-full">
                            <ArrowUp className="h-6 w-6 font-bold" />
                        </motion.div>
                        <span className="text-md uppercase font-medium">Back to top</span>
                    </button>

                </div>

                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between lg:px-12 py-10">

                    {/* Logo & Description Section */}
                    <div className="flex flex-col items-center lg:items-start justify-center gap-6">
                        <span className="font-dela text-3xl text-white">cinevest<span className="text-[#c9ec06]">.</span></span>
                        <p className="max-w-xs text-md text-[#FFFFFF]/70 text-center lg:text-left">
                            Independent stories are better together. <br />
                            Powered by Arc Testnet
                        </p>
                        <div className="flex gap-6">
                            <Link href="#" className="text-[#c9ec06] hover:text-white transition-all transform hover:-translate-y-1"><Twitter className="h-6 w-6" /></Link>
                            <Link href="#" className="text-[#c9ec06] hover:text-white transition-all transform hover:-translate-y-1"><Facebook className="h-6 w-6" /></Link>
                            <Link href="#" className="text-[#c9ec06] hover:text-white transition-all transform hover:-translate-y-1"><Instagram className="h-6 w-6" /></Link>
                            <Link href="#" className="text-[#c9ec06] hover:text-white transition-all transform hover:-translate-y-1"><Linkedin className="h-6 w-6" /></Link>
                        </div>
                    </div>

                    {/* Links Container */}
                    <div className="flex flex-row flex-wrap items-start justify-center gap-10 md:gap-24 mt-12 lg:mt-0">
                        {/* Company Column */}
                        <div className="flex flex-col">
                            <h4 className="text-white text-lg font-semibold mb-6">Company</h4>
                            <ul className="space-y-4">
                                {['About', 'Features', 'Demo'].map((item) => (
                                    <li key={item}>
                                        <Link href="#" className="text-gray-400 hover:text-[#c9ec06] transition-colors">{item}</Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Quick Links Column */}
                        <div className="flex flex-col">
                            <h4 className="text-white text-lg font-semibold mb-6">Quick Links</h4>
                            <ul className="space-y-4">
                                {['Home', 'Create a campaign', 'How it works'].map((item) => (
                                    <li key={item}>
                                        <Link href="#" className="text-gray-400 hover:text-[#c9ec06] transition-colors">{item}</Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Legal Links Column */}
                        <div className="flex flex-col">
                            <h4 className="text-white text-lg font-semibold mb-6">Legal</h4>
                            <ul className="space-y-4">
                                {['Terms of Use', 'Privacy Policy', 'Filmmakers'].map((item) => (
                                    <li key={item}>
                                        <Link href="#" className="text-gray-400 hover:text-[#c9ec06] transition-colors">{item}</Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="border-t border-white/5 flex flex-col md:flex-row justify-between items-center py-10 text-[10px] uppercase tracking-[0.2em] gap-4 lg:px-12 opacity-60">
                    <p>Testnet demo</p>
                    <p>© 2026 cinevest. All rights reserved.</p>
                </div>
            </div>

            {/* Oversized wordmark carried over from the cinevest landing page */}
            <div
                className="mt-6 text-center pb-[.08em] text-[19vw] leading-[.95] font-bold tracking-[-.085em] whitespace-nowrap text-[#d3ed05] select-none min-[801px]:text-[clamp(80px,19.5vw,360px)] [&>span]:text-[#d3ed05]/40"
                aria-hidden="true"
            >
                cinevest<span>.</span>
            </div>
        </footer>
    );
};

export default Footer;