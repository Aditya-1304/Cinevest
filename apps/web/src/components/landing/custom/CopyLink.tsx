"use client";

import React, { useState } from "react";
import { motion, useTime, useTransform, AnimatePresence } from "motion/react";

const CopyLink = () => {
    const [copied, setCopied] = useState(false);
    const value = "https://theshivam.tech";

    const time = useTime();
    const rotate = useTransform(time, [0, 4000], [0, 360], {
        clamp: false,
    });

    const rotatingBg = useTransform(rotate, (r) => {
        return `conic-gradient(from ${r}deg, transparent 0deg, transparent 300deg, #d3ed05 330deg, transparent 360deg)`;
    });

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center gap-8 w-full p-4">
            <h1 className="font-bold text-2xl md:text-3xl text-center text-white tracking-tight">
                Share Your Campaign Link And Rally Backers
            </h1>

            {/* Container Wrapper with Glow */}
            <div className="relative group w-full max-w-lg">

                {/* GLOW EFFECT: A blurred copy of the border behind the main one */}
                <div className="absolute -inset-0.5 bg-linear-to-r from-[#d3ed05]/20 to-[#d3ed05]/0 rounded-xl blur-lg opacity-50 group-hover:opacity-100 transition duration-500" />

                {/* BORDER CONTAINER */}
                <div className="relative p-px rounded-xl overflow-hidden bg-[#1a1a1a]">
                    <motion.div
                        className="absolute inset-0"
                        style={{
                            background: rotatingBg,
                        }}
                    />

                    {/* INNER CONTENT */}
                    <div className="relative z-10 flex items-center justify-between bg-[#030E14] p-2 rounded-[11px] h-full">
                        <div className="flex-1 px-4 py-2 overflow-hidden">
                            <span className="block text-gray-500 text-[10px] uppercase tracking-widest font-bold mb-0.5">
                                Campaign Link
                            </span>
                            <input
                                readOnly
                                value={value}
                                className="w-full bg-transparent text-gray-100 text-lg font-mono truncate outline-none selection:bg-[#d3ed05] selection:text-black"
                            />
                        </div>

                        <motion.button
                            onClick={handleCopy}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.95 }}
                            className={`
                                relative
                                w-28 h-11
                                rounded-lg
                                font-bold
                                text-sm
                                uppercase
                                tracking-wide
                                transition-colors
                                duration-200
                                flex items-center justify-center
                                ${copied
                                    ? "bg-green-500 text-black"
                                    : "bg-[#d3ed05] text-[#030E14] hover:bg-[#e4ff1a]"
                                }
                            `}
                        >
                            <AnimatePresence mode="wait" initial={false}>
                                {copied ? (
                                    <motion.div
                                        key="copied"
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.8, opacity: 0 }}
                                        className="flex items-center gap-2"
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        <span>Copied!</span>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="copy"
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.8, opacity: 0 }}
                                        className="flex items-center gap-2"
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                        <span>Copy</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CopyLink;