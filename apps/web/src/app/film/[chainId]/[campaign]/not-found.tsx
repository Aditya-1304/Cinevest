import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";

export default function NotFound() {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-[#04141C] p-8 text-white">
      <h1 className="text-2xl">Campaign not found</h1>
      <p className="text-white/70">
        The URL is not a valid campaign address format.
      </p>
      <Link
        className="inline-block text-sm font-bold text-[#d3ed05] underline hover:text-[#e4ff1a]"
        href="/demo"
      >
        ← All films
      </Link>
    </section>
  );
}
