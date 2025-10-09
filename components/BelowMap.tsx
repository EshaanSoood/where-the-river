"use client";

import Hero from "@/components/Hero";
import BandcampEmbed from "@/components/BandcampEmbed";
import dynamic from "next/dynamic";

export default function BelowMap() {
  const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });
  return (
    <div className="px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <Hero />
        </section>
        <section aria-label="Bandcamp player">
          <BandcampEmbed />
        </section>
      </div>
      <section aria-label="Global participation">
        <Globe />
      </section>
    </div>
  );
}


