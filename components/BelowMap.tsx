"use client";

import { useState } from "react";
import Hero from "@/components/Hero";
import BandcampEmbed from "@/components/BandcampEmbed";
import dynamic from "next/dynamic";

export default function BelowMap() {
  const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  return (
    <div className="px-[25px] py-6">
      {/* Top area: controls and globe */}
      <section aria-label="Global participation" className="relative h-[100vh]">
        {/* Corner controls */}
        <div className="absolute top-3 left-3 z-40">
          <button
            onClick={() => setDashboardOpen(true)}
            className="px-3 py-2 rounded-md bg-white/90 shadow-sm border border-purple-200 text-purple-900 text-sm md:text-base"
            aria-label="Open dashboard"
          >
            <span className="hidden md:inline">Dashboard</span>
            <span className="md:hidden">☰</span>
          </button>
        </div>
        <div className="absolute top-3 right-3 z-40">
          <button
            onClick={() => setLeaderboardOpen(true)}
            className="px-3 py-2 rounded-md bg-white/90 shadow-sm border border-purple-200 text-purple-900 text-sm md:text-base"
            aria-label="Open leaderboard"
          >
            <span className="hidden md:inline">Leaderboard</span>
            <span className="md:hidden">☰</span>
          </button>
        </div>

        {/* Globe centered; top sits visually between corner controls */}
        <Globe />

        {/* Overlays: open above globe with subtle shadow */}
        {dashboardOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/10" aria-hidden="true" onClick={() => setDashboardOpen(false)} />
            <div className="absolute top-4 left-4 max-w-sm w-[88vw] md:w-[420px] bg-white rounded-lg shadow-xl border border-purple-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100">
                <h3 className="text-purple-900 font-semibold">Dashboard</h3>
                <button onClick={() => setDashboardOpen(false)} aria-label="Close dashboard" className="text-purple-800">✕</button>
              </div>
              <div className="p-4 text-sm text-purple-900/80">
                {/* Placeholder content */}
                Coming soon: your participation stats, invites, and activity.
              </div>
            </div>
          </div>
        )}
        {leaderboardOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/10" aria-hidden="true" onClick={() => setLeaderboardOpen(false)} />
            <div className="absolute top-4 right-4 max-w-sm w-[88vw] md:w-[420px] bg-white rounded-lg shadow-xl border border-purple-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100">
                <h3 className="text-purple-900 font-semibold">Leaderboard</h3>
                <button onClick={() => setLeaderboardOpen(false)} aria-label="Close leaderboard" className="text-purple-800">✕</button>
              </div>
              <div className="p-4 text-sm text-purple-900/80">
                {/* Placeholder content */}
                Coming soon: top referrers and countries.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Below the globe: 15px gap then two-column on desktop */}
      <div className="mt-[15px] grid gap-6 lg:grid-cols-2">
        <section aria-label="Project intro">
          <Hero />
        </section>
        <section aria-label="Bandcamp player">
          <BandcampEmbed />
        </section>
      </div>
    </div>
  );
}


