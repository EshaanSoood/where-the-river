"use client";

import BelowMap from "@/components/BelowMap";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ paddingInline: "clamp(16px, 4vw, 32px)" }}>
      <main className="flex-1 min-h-0" style={{ ['--hdr' as unknown as string]: '40px' }}>
        <BelowMap />
      </main>
      <footer aria-label="Site footer" className="mt-6">
        <div style={{ height: 1, background: "rgba(11,13,26,0.35)", boxShadow: "0 0 2px rgba(11,13,26,0.25)" }} />
      </footer>
    </div>
  );
}


