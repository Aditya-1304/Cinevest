"use client";
import Link from "next/link";
import React, { useState } from "react";
import { motion } from "motion/react";

const ShimmerButton = () => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <Link
            href="/"
            target="_blank"
            aria-label="schedule meeting button"
            title="schedule meeting button"
            className="relative group flex items-center gap-3 justify-center bg-linear-to-br from-[#282829] to-[#333335] text-white p-2 rounded-full overflow-hidden border border-zinc-700 hover:ring-1 hover:ring-zinc-600 hover:shadow-xl duration-300"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Shimmer effect with motion */}
            <motion.div
                className="absolute h-full w-12 bg-linear-to-r from-transparent via-white/30 to-transparent -skew-x-12"
                initial={{ left: "-4rem" }}
                animate={{
                    left: isHovered ? "calc(100% + 4rem)" : "-4rem"
                }}
                transition={{
                    duration: 0.7,
                    ease: "easeInOut"
                }}
            />

            <div className="relative size-10 md:size-12 rounded-full overflow-hidden bg-white/20">
            </div>
            <div className="text-left">
                <div className="text-sm md:text-base">Schedule a Free Meeting</div>
                <div className="text-xs md:text-sm text-gray-400">With Omar</div>
            </div>

            <motion.svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                animate={{
                    x: isHovered ? 8 : 0
                }}
                transition={{
                    duration: 0.3
                }}
            >
                <path
                    d="M9 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                />
            </motion.svg>
        </Link>
    );
};

export default ShimmerButton;