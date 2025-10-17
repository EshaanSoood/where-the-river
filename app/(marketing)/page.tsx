"use client";

import BelowMap from "@/components/BelowMap";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ paddingInline: "clamp(16px, 4vw, 32px)" }}>
      <main className="flex-1 min-h-0" style={{ ['--hdr' as unknown as string]: '40px' }}>
        <BelowMap />
      </main>
      <footer aria-label="Site footer" className="mt-6 lg:sticky bottom-0 z-30">
        <div
          className="w-full rounded-[24px]"
          style={{
            height: 40,
            background: 'rgba(210, 245, 250, 0.32)',
            backdropFilter: 'blur(10px)',
            borderTop: '1px solid rgba(255,255,255,0.25)'
          }}
        />
      </footer>
    </div>
  );
}


