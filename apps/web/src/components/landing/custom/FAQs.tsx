"use client";
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const FAQS = [
    {
        question: "What is cinevest?",
        answer: "cinevest is a testnet platform where independent filmmakers raise test USDC from backers, release funds against milestones and share viewing revenue."
    },
    {
        question: "How do I back a film?",
        answer: "Connect your wallet on Arc Testnet, open a funding campaign and contribute test USDC before its deadline."
    },
    {
        question: "Are returns guaranteed?",
        answer: "No. Backer returns are capped and depend on viewing revenue. Test USDC has no monetary value."
    },
    {
        question: "Where are campaigns listed?",
        answer: "Campaign listings are designed to be publicly queryable on Arkiv so audiences can discover films outside a single app."
    },
    {
        question: "Can I watch the finished film?",
        answer: "Yes. Released films can be unlocked for a small test USDC price per view from the watch page."
    }
];

const FAQs = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="max-w-4xl mx-auto px-4">
            <div className="space-y-4">
                {FAQS.map((faq, index) => (
                    <div
                        key={index}
                        className="border border-[#FFFFFF]/40 rounded-2xl overflow-hidden "
                    >
                        <button
                            onClick={() => toggleFAQ(index)}
                            className="w-full flex items-center justify-between p-6 text-left"
                        >
                            <h3 className="text-lg md:text-xl font-light font-inter text-white pr-4">
                                {index + 1}. {faq.question}
                            </h3>

                            {/* Animated Plus/Minus Icon */}
                            <div className="shrink-0 w-9 h-9 bg-[#d3ed05] rounded-full flex items-center justify-center relative">
                                {/* Horizontal line - always visible */}
                                <motion.div
                                    className="absolute w-5 h-0.5 bg-black"
                                />
                                {/* Vertical line - rotates to hide when open */}
                                <motion.div
                                    animate={{ rotate: openIndex === index ? 90 : 0 }}
                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                    className="absolute w-0.5 h-5 bg-black"
                                />
                            </div>
                        </button>

                        <AnimatePresence initial={false}>
                            {openIndex === index && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3, ease: "easeInOut" }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-6 pb-6 pt-2">
                                        <p className="text-[#FFFFFF]/70 leading-relaxed">
                                            {faq.answer}
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FAQs;