import { Dela_Gothic_One, Inter } from "next/font/google";
import ReactLenis from "lenis/react";

import About from "./sections/About";
import CtaSection from "./sections/CtaSection";
import Economy from "./sections/Economy";
import Feature from "./sections/Feature";
import Footer from "./sections/Footer";
import Header from "./sections/Header";
import Hero from "./sections/Hero";
import StepsSection from "./sections/StepsSection";

const inter = Inter({
  variable: "--font-Inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const delaGothic = Dela_Gothic_One({
  variable: "--font-Dela",
  subsets: ["latin"],
  weight: ["400"],
});

// Landing-only shell: fonts, smooth scroll and the grid backdrop stay scoped to "/".
export function LandingPage() {
  return (
    <div className={`${inter.variable} ${delaGothic.variable} relative isolate bg-[#01060f]`}>
      <ReactLenis root>
        <Header />
        <main className="relative">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-white/5 bg-[linear-gradient(to_right,#d9d9d980_1px,transparent_1px),linear-gradient(to_bottom,#d9d9d980_1px,transparent_1px)] bg-size-[122px_122px]" />
          <div className="relative z-10">
            <Hero />
            <About />
            <Feature />
            <Economy />
            <StepsSection />
            <CtaSection />
            <Footer />
          </div>
        </main>
      </ReactLenis>
    </div>
  );
}
