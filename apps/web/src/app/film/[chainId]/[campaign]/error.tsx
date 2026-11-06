"use client";

import { Button } from "@/components/ui/button";

export default function CampaignError({ reset }: { reset: () => void }) {
  return (
    <section
      className="space-y-4 rounded-2xl border border-white/10 bg-[#04141C] p-8 text-white"
      role="alert"
    >
      <h1 className="text-2xl">Campaign unavailable</h1>
      <p className="text-white/70">
        The campaign could not be displayed. Try loading it again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
