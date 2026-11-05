"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Film, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#discover", label: "Discover" },
  { href: "#about", label: "About" },
  { href: "#features", label: "Features" },
  { href: "#economy", label: "Flow" },
  { href: "/dashboard/creator", label: "Dashboard" },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled || open
          ? "border-border bg-background/85 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex items-center gap-4 px-[var(--landing-gutter)] py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[23px] font-extrabold tracking-[-.06em] text-foreground"
          aria-label="CineVest home"
        >
          <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
            <Film size={18} />
          </span>
          <span className="flex items-baseline">
            cinevest<span className="text-primary">.</span>
          </span>
        </Link>

        <nav
          className="mx-auto hidden items-center gap-7 text-sm font-medium text-muted-foreground lg:flex [&_a:hover]:text-primary"
          aria-label="Main navigation"
        >
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="transition">
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="#discover"
          className="hidden items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/85 sm:inline-flex"
        >
          Explore films
        </Link>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="ml-auto inline-flex size-10 items-center justify-center rounded-lg border border-border text-foreground lg:hidden"
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <nav
          id="landing-mobile-menu"
          className="border-t border-border px-[var(--landing-gutter)] pb-6 pt-3 lg:hidden"
          aria-label="Mobile navigation"
        >
          <div className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-sm font-medium text-muted-foreground hover:bg-card hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="#discover"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
            >
              Explore films
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
