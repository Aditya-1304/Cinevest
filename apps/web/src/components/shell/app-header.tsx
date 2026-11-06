"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import { ARC_TESTNET } from "@/lib/chain";
import { WalletConnect } from "@/components/wallet/wallet-connect";
import { useAccount } from "wagmi";

const NAV = [
  { href: "/discover", label: "Discover" },
  { href: "/create", label: "Create" },
  { href: "/dashboard/creator", label: "Creator" },
  { href: "/dashboard/backer", label: "Backer" },
  { href: "/demo", label: "Demo" },
];

/**
 * Sticky header shared by every app page. It starts transparent and, once
 * the active scroll root (an inner scroll container on fixed pages, the
 * window elsewhere) passes 50px, gains a blurred backdrop and border.
 */
export function AppHeader({ compact = false }: { compact?: boolean }) {
  const { address, chainId } = useAccount();
  const pathname = usePathname();
  const [walletOpen, setWalletOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const container = el.closest<HTMLElement>("[data-scroll-root]");
    const onScroll = () => {
      setScrolled(
        container ? container.scrollTop > 50 : window.scrollY > 50,
      );
    };
    const target: EventTarget = container ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => target.removeEventListener("scroll", onScroll);
  }, []);

  // Close the wallet dialog once a connection completes, and on Escape.
  const wasConnected = useRef(!!address);
  useEffect(() => {
    if (address && !wasConnected.current && walletOpen) setWalletOpen(false); // eslint-disable-line react-hooks/set-state-in-effect -- close after connect completes
    wasConnected.current = !!address;
  }, [address, walletOpen]);
  useEffect(() => {
    if (!walletOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setWalletOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walletOpen]);

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
  const wrongNetwork = !!address && chainId !== ARC_TESTNET.id;

  return (
    <header
      ref={ref}
      className={cn(
        "sticky top-0 z-30 border-b transition-[background-color,border-color] duration-300",
        scrolled || menuOpen
          ? "border-white/10 bg-[#030e14]/85 backdrop-blur-xl"
          : "border-transparent bg-[#030e14]/0",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 px-[max(6%,calc((100%-1440px)/2))] py-4 min-[761px]:grid min-[761px]:grid-cols-[1fr_auto_1fr] min-[761px]:gap-[30px]",
        )}
      >
        <Link
          className="font-dela inline-flex items-center gap-2 text-2xl text-white"
          href="/"
        >
          <Image src="/brand/logo-mark.png" alt="" width={32} height={32} priority className="size-8" />
          <span>cinevest<span className="text-[#d3ed05]">.</span></span>
        </Link>
        <nav
          className={cn("order-3 flex w-full flex-col gap-1 text-sm font-medium text-white/75 min-[761px]:order-none min-[761px]:justify-self-center min-[761px]:w-auto min-[761px]:flex-row min-[761px]:items-center min-[761px]:gap-7 [&_a:hover]:text-[#d3ed05] [&_a]:transition [&_a[aria-current=page]]:font-semibold [&_a[aria-current=page]]:text-[#d3ed05]", menuOpen ? "" : "hidden min-[761px]:flex")}
          aria-label="Main navigation"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname === item.href ? "page" : undefined}
              className="rounded-lg px-2 py-2.5 min-[761px]:px-0"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setWalletOpen(true)}
          className={cn(
            "ml-auto rounded-lg px-4 py-2.5 text-xs font-bold transition min-[761px]:justify-self-end",
            wrongNetwork
              ? "bg-amber-400 text-black hover:bg-amber-300"
              : "bg-[#d3ed05] text-black hover:bg-[#e4ff1a]",
          )}
        >
          {!address
            ? "Connect wallet"
            : wrongNetwork
              ? "Switch to Arc Testnet"
              : `${short} · Arc`}
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="ml-1 grid size-10 place-items-center rounded-lg border border-white/15 text-white min-[761px]:hidden"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
      {walletOpen && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setWalletOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#04141C] p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><h2 id="wallet-dialog-title" className="font-dela text-lg uppercase text-white">Wallet &amp; network</h2><button type="button" onClick={() => setWalletOpen(false)} aria-label="Close wallet dialog" className="text-white/70 hover:text-white">✕</button></div>
          <WalletConnect />
        </section>
      </div>}
    </header>
  );
}
