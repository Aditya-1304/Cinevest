import type { ReactNode } from "react";
import { Dela_Gothic_One, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppHeader } from "./app-header";

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

/**
 * Shell for every non-landing page. Loads the same Inter/Dela fonts as the
 * landing wrapper and shares its palette: page bg #01060f with the faint
 * grid backdrop, cards on #04141C and lime #d3ed05 accents.
 */
export function AppShell({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        `${inter.variable} ${delaGothic.variable} relative isolate min-h-screen bg-[#01060f] font-inter text-white [color-scheme:dark] [&_a:focus-visible]:outline-3 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-[#d3ed05] [&_button:focus-visible]:outline-3 [&_button:focus-visible]:outline-offset-4 [&_button:focus-visible]:outline-[#d3ed05]`,
        compact && "flex h-screen flex-col overflow-hidden",
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-size-[122px_122px]" />
      <div
        data-scroll-root={compact ? "" : undefined}
        className={cn("flex flex-1 flex-col", compact && "min-h-0 overflow-y-auto")}
      >
        <AppHeader compact={compact} />
        <main
          className={cn(
            "mx-auto flex w-full flex-col px-[max(6%,calc((100%-1440px)/2))] [&_h1]:mb-5 [&_h1]:mt-3 [&_h1]:font-dela [&_h1]:text-[clamp(30px,4.5vw,50px)] [&_h1]:uppercase [&_h1]:leading-[1.12] [&_h2]:font-dela [&_h2]:uppercase [&_p]:leading-[1.7] [&_p]:text-white/70",
            compact
              ? "min-h-0 flex-1 pb-14 pt-4"
              : "pb-[100px] pt-10",
          )}
        >
          <div className="w-full">{children}</div>
        </main>
      </div>
      <footer
        className={cn(
          "border-t border-white/10 bg-[#030e14] px-[max(6%,calc((100%-1440px)/2))] py-7 text-xs leading-[1.6] text-white/60",
          compact && "py-4",
        )}
      >
        Cinevest testnet preview · Test USDC has no monetary value. Returns are
        not guaranteed.
      </footer>
    </div>
  );
}
