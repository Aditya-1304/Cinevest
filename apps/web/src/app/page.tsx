import { Button } from "@/components/ui/button";

/** Scaffold landing page; campaign and wallet flows will be added in later phases. */
export default function Home() {
 return <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10"><header className="flex items-center justify-between border-b pb-6"><span className="text-xl font-bold">Cinevest</span><span className="rounded-full border px-3 py-1 text-xs">TESTNET DEMO</span></header><section className="max-w-2xl py-24"><p className="mb-5 text-sm uppercase tracking-widest">Independent film. Shared possibility.</p><h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">Bring the next story to life.</h1><p className="mt-6 text-lg text-neutral-600">Film financing and pay-per-view settlement on Arc Testnet. The workspace is ready; campaign, identity and playback integrations are not connected yet.</p><Button asChild className="mt-8"><a href="/api/health">Check backend health</a></Button></section><footer className="mt-auto border-t pt-6 text-sm text-neutral-500">Hackathon scaffold · Test tokens only · No real investment offering</footer></main>;
}
