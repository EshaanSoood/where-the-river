"use client";

import { useEffect, useRef, useState } from "react";
import Hero from "@/components/Hero";
import BandcampEmbed from "@/components/BandcampEmbed";
import dynamic from "next/dynamic";

export default function BelowMap() {
  const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const leaderboardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (dashboardOpen && dashboardRef.current) {
      dashboardRef.current.focus();
    }
  }, [dashboardOpen]);
  useEffect(() => {
    if (leaderboardOpen && leaderboardRef.current) {
      leaderboardRef.current.focus();
    }
  }, [leaderboardOpen]);

  const trapFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = e.currentTarget;
    const focusable = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="px-[25px] py-6">
      {/* Hero */}
      <section aria-label="Global participation" className="relative">
        {/* Participate / Log in top-left (first in DOM for tab order) */}
        <div className="absolute top-3 left-3 z-40">
          <a
            href="#dashboard"
            className="px-3 py-2 rounded-md bg-white/90 shadow-sm border border-purple-200 text-purple-900 text-sm md:text-base btn"
          >
            Participate / Log in
          </a>
        </div>

        {/* Centered globe with adjacent collapsible toggles */}
        <div className="mx-auto max-w-5xl">
          <div className="relative aspect-square md:aspect-[16/10]">
            {/* Globe container: fills this box; Globe component sizes to parent */}
            <div className="absolute inset-0">
              <Globe />
            </div>

            {/* Collapsible toggles docked near globe */}
            <div className="pointer-events-none">
              <div className="absolute top-3 left-3 pointer-events-auto">
                <button
                  type="button"
                  aria-controls="panel-dashboard"
                  aria-expanded={dashboardOpen}
                  className="px-3 py-2 rounded-md bg-white/90 shadow-sm border border-purple-200 text-purple-900 text-sm"
                  onClick={() => setDashboardOpen((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setDashboardOpen(false);
                  }}
                >
                  Dashboard
                </button>
              </div>
              <div className="absolute top-3 right-3 pointer-events-auto">
                <button
                  type="button"
                  aria-controls="panel-leaderboard"
                  aria-expanded={leaderboardOpen}
                  className="px-3 py-2 rounded-md bg-white/90 shadow-sm border border-purple-200 text-purple-900 text-sm"
                  onClick={() => setLeaderboardOpen((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setLeaderboardOpen(false);
                  }}
                >
                  Leaderboard
                </button>
              </div>
            </div>

            {/* Overlay panels (do not shift layout) */}
            {dashboardOpen && (
              <div
                id="panel-dashboard"
                role="dialog"
                aria-modal="true"
                className="absolute top-14 left-3 z-50 w-[88vw] md:w-[420px] bg-white rounded-lg shadow-xl border border-purple-200"
                tabIndex={-1}
                ref={dashboardRef}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setDashboardOpen(false);
                  trapFocus(e);
                }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100">
                  <h3 className="text-purple-900 font-semibold">Dashboard</h3>
                  <button aria-label="Close dashboard" onClick={() => setDashboardOpen(false)} className="text-purple-800">✕</button>
                </div>
                <div className="p-4 text-sm text-purple-900/80">
                  Coming soon: your participation stats, invites, and activity.
                </div>
              </div>
            )}
            {leaderboardOpen && (
              <div
                id="panel-leaderboard"
                role="dialog"
                aria-modal="true"
                className="absolute top-14 right-3 z-50 w-[88vw] md:w-[420px] bg-white rounded-lg shadow-xl border border-purple-200"
                tabIndex={-1}
                ref={leaderboardRef}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setLeaderboardOpen(false);
                  trapFocus(e);
                }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100">
                  <h3 className="text-purple-900 font-semibold">Leaderboard</h3>
                  <button aria-label="Close leaderboard" onClick={() => setLeaderboardOpen(false)} className="text-purple-800">✕</button>
                </div>
                <div className="p-4 text-sm text-purple-900/80">
                  Coming soon: top referrers and countries.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Two-column section under hero */}
      <div className="mt-6 mx-auto max-w-5xl grid gap-6 lg:grid-cols-5">
        <section aria-label="Project intro" className="lg:col-span-3">
          <h2 className="sr-only">Where The River Flows</h2>
          <Hero />
        </section>
        <section aria-label="Bandcamp player" className="lg:col-span-2 lg:sticky lg:top-4 self-start">
          <BandcampEmbed />
        </section>
      </div>
    </div>
  );
}


