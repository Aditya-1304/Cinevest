"use client";
import React from "react";
import { motion, Variants } from "motion/react";

export const steps = [
    {
        id: "01",
        title: "Connect Wallet",
        description: "Use MetaMask or any injected wallet on Arc Testnet.",
    },
    {
        id: "02",
        title: "Fund a campaign",
        description: "Contribute test USDC to a film while its campaign is open.",
    },
    {
        id: "03",
        title: "Track and watch",
        description:
            "Follow milestones, claim any returns and stream the finished cut.",
    },
] as const;

/* Parent container controls stagger */
const containerVariants: Variants = {
    hidden: {},
    show: {
        transition: {
            staggerChildren: 0.25, // delay between cards
        },
    },
};

/* Same animation for all cards */
const cardVariants: Variants = {
    hidden: {
        opacity: 0,
        y: 50,
    },
    show: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.6,
            ease: "easeOut",
        },
    },
};

const StepsCard = () => {
    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-10 px-4"
        >
            {steps.map((step) => (
                <motion.div
                    key={step.id}
                    variants={cardVariants}
                    className="
                        rounded-2xl 
                        px-10 py-12 
                        flex flex-col gap-6
                        bg-[#04141C]
                        shadow-[0_0_40px_rgba(0,0,0,0.6)]
                    "
                >
                    {/* Step Number */}
                    <h1 className="text-[#D3ED05] font-dela text-4xl tracking-wider">
                        {step.id}
                    </h1>

                    {/* Title */}
                    <h2 className="text-white text-2xl uppercase font-dela font-bold">
                        {step.title}
                    </h2>

                    {/* Description */}
                    <p className="text-white/60 leading-relaxed">
                        {step.description}
                    </p>
                </motion.div>
            ))}
        </motion.div>
    );
};

export default StepsCard;
