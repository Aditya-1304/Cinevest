'use client';
import { motion, Variants, useInView } from 'motion/react';
import { useRef } from 'react';

interface AnimatedTextProps {
    text: string;
    className?: string;
    staggerDelay?: number;
    once?: boolean;
    highlightText?: string;
    highlightClassName?: string;
    isActive?: boolean;           // override to control when animation runs
    amount?: number;              // viewport amount override
    margin?: string;              // viewport margin override
}

const letterVariants: Variants = {
    initial: { opacity: 0, y: 50 },
    animate: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, ease: "easeOut" }
    }
};

const AnimatedText = ({
    text,
    className = "",
    staggerDelay = 0.03,
    once = true,
    highlightText,
    highlightClassName = "",
    isActive,
    amount = 0.5,
}: AnimatedTextProps) => {
    const ref = useRef(null);
    const inView = useInView(ref, { once, amount });
    const shouldAnimate = isActive ?? inView;

    const highlightStart = highlightText ? text.indexOf(highlightText) : -1;
    const highlightEnd = highlightStart !== -1 && highlightText
        ? highlightStart + highlightText.length
        : -1;

    // Split text into words while preserving spaces
    const words = text.split(/(\s+)/);

    let charIndex = 0;

    return (
        <motion.span
            ref={ref}
            initial="initial"
            animate={shouldAnimate ? "animate" : "initial"}
            variants={{
                initial: {},
                animate: { transition: { staggerChildren: staggerDelay } }
            }}
            className={className}
        >
            {words.map((word, wordIndex) => {
                // Handle spaces - render them directly
                if (/^\s+$/.test(word)) {
                    const spaceElements = word.split("").map((_, i) => {
                        charIndex++;
                        return (
                            <motion.span
                                key={`space-${wordIndex}-${i}`}
                                variants={letterVariants}
                                className="inline"
                            >
                                {" "}
                            </motion.span>
                        );
                    });
                    return spaceElements;
                }

                // Handle actual words - wrap in inline-block container
                const wordElement = (
                    <span
                        key={`word-${wordIndex}`}
                        className="inline-block whitespace-nowrap"
                    >
                        {word.split("").map((char, i) => {
                            const currentCharIndex = charIndex;
                            charIndex++;

                            const isHighlighted =
                                highlightStart !== -1 &&
                                highlightEnd !== -1 &&
                                currentCharIndex >= highlightStart &&
                                currentCharIndex < highlightEnd;

                            return (
                                <motion.span
                                    key={`char-${wordIndex}-${i}`}
                                    variants={letterVariants}
                                    className={`inline-block ${isHighlighted ? highlightClassName : ''}`}
                                >
                                    {char}
                                </motion.span>
                            );
                        })}
                    </span>
                );

                return wordElement;
            })}
        </motion.span>
    );
};

export default AnimatedText;