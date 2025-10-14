"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import Hero from "@/components/Hero";
import BandcampEmbed from "@/components/BandcampEmbed";
import dynamic from "next/dynamic";
// DashboardSheet is not used directly; inline overlay below owns the layout

const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

export default function BelowMap() {
  const router = useRouter();

  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [globalBoats, setGlobalBoats] = useState<number | null>(null);
  const [top5, setTop5] = useState<{ first_name: string; country_code: string; boats_total: number }[]>([]);
  const [dashboardMode, setDashboardMode] = useState<"guest" | "user">("guest");
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const leaderboardRef = useRef<HTMLDivElement | null>(null);
  const { user, loading } = useUser();

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

  useEffect(() => {
    if (!leaderboardOpen) return;
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((j) => {
        if (typeof j?.totalBoats === "number") setGlobalBoats(j.totalBoats);
        if (Array.isArray(j?.top)) setTop5(j.top);
      })
      .catch(() => setGlobalBoats(null));
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

  function DashboardContent({ mode, onAuthenticated }: { mode: "guest" | "user"; onAuthenticated: () => void }) {
    // Placeholder wrapper for future content integration; DashboardSheet handles flows
    return (
      <div>
        {mode === "guest" ? (
          <div>Sign in to start your river. Use the Participate button or email OTP in the panel.</div>
        ) : (
          <div>Welcome back. View your river, invites, and activity.</div>
        )}
      </div>
    );
  }

  return (
    <div className="px-[25px] py-6">
      {/* Hero */}
      <section aria-label="Global participation" className="relative">
        {/* Top-left control: Dashboard when logged-in, Participate/Login when logged-out */}
        {!loading && (
          <div className="absolute top-3 left-3 z-40">
            <button
              type="button"
              className="px-3 py-2 rounded-md bg-white/90 shadow-sm border border-purple-200 text-purple-900 text-sm md:text-base btn"
              aria-controls="panel-dashboard"
              aria-expanded={dashboardOpen}
              onClick={() => {
                if (user) {
                  setDashboardMode("user");
                  setDashboardOpen((v) => !v);
                } else {
                  setDashboardMode("guest");
                  setDashboardOpen(true);
                }
              }}
            >
              {user ? "Dashboard" : "Participate / Log in"}
            </button>
          </div>
        )}

        {/* Top-right control: Leaderboard toggle (collapsed by default) */}
        <div className="absolute top-3 right-3 z-40">
          <button
            type="button"
            aria-controls="panel-leaderboard"
            aria-expanded={leaderboardOpen}
            className="px-3 py-2 rounded-md bg-white/90 shadow-sm border border-purple-200 text-purple-900 text-sm"
            onClick={() => setLeaderboardOpen((v) => !v)}
            onKeyDown={(e) => { if (e.key === "Escape") setLeaderboardOpen(false); }}
          >
            Leaderboard
          </button>
        </div>

        {/* Centered globe with adjacent collapsible toggles */}
        <div className="mx-auto max-w-5xl">
          <div className="relative aspect-square md:aspect-[16/10]">
            {/* Globe container: fills this box; Globe component sizes to parent */}
            <div className="absolute inset-0">
              <Globe />
            </div>

            {/* Controls now live at the page corners; keep globe layer clean and non-interfering */}

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
                {dashboardMode === "guest" ? (
                  <div className="relative p-6">
                    <button
                      aria-label="Close dashboard"
                      onClick={() => setDashboardOpen(false)}
                      className="absolute top-2 right-2"
                      style={{ color: "var(--ink-2)" }}
                    >
                      ✕
                    </button>
                    <div className="flex flex-col items-center justify-center gap-3 py-4">
                      <button
                        className="font-seasons rounded-md px-4 py-3 w-3/4"
                        style={{ background: "var(--teal)", color: "var(--parchment)", boxShadow: "0 6px 16px rgba(0,0,0,0.1)" }}
                        onClick={() => {
                          setDashboardOpen(false);
                          router.push("/participate");
                        }}
                      >
                        Start Your Boat
                      </button>
                      <button
                        className="font-seasons rounded-md px-4 py-3 w-3/4"
                        style={{ background: "var(--teal)", color: "var(--parchment)", boxShadow: "0 6px 16px rgba(0,0,0,0.1)" }}
                        onClick={() => {
                          setDashboardOpen(false);
                          router.push("/participate");
                        }}
                      >
                        Resume Your River
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100">
                      <h3 className="text-purple-900 font-semibold">Dashboard</h3>
                      <button aria-label="Close dashboard" onClick={() => setDashboardOpen(false)} className="text-purple-800">✕</button>
                    </div>
                    <div className="p-4 text-sm text-purple-900/80">
                      <DashboardContent mode={dashboardMode} onAuthenticated={() => setDashboardMode("user")} />
                    </div>
                  </>
                )}
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
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--mist)" }}>
                  <h3 className="font-semibold" style={{ color: "var(--ink)" }}>Leaderboard</h3>
                  <button aria-label="Close leaderboard" onClick={() => setLeaderboardOpen(false)} style={{ color: "var(--ink-2)" }}>✕</button>
                </div>
                <div className="p-6" style={{ color: "var(--ink)" }}>
                  <div className="text-center mb-4">
                    <div className="font-seasons text-2xl mb-1">Total Boats</div>
                    <div className="text-4xl font-bold" style={{ color: "var(--teal)" }}>{globalBoats ?? "—"}</div>
                  </div>
                  <ol className="space-y-2">
                    {top5.map((row, idx) => {
                      const rank = idx + 1;
                      const boatStyles: Record<number, { fill: string; fx?: string }> = {
                        1: { fill: '#d4af37', fx: 'drop-shadow(0 0 6px rgba(212,175,55,.6))' }, // gold
                        2: { fill: '#C0C0C0' }, // silver
                        3: { fill: '#cd7f32' }, // bronze
                        4: { fill: '#8b5a2b' }, // wood
                        5: { fill: '#8b5a2b' }, // wood
                      };
                      const style = boatStyles[rank] || { fill: 'var(--waikawa-gray)' };
                      return (
                        <li key={idx} className="flex items-center justify-between rounded-md px-3 py-2 bg-[color:var(--white-soft)] border" style={{ borderColor: 'var(--mist)' }}>
                          <div className="flex items-center gap-3">
                            <div className="rounded-full size-8 flex items-center justify-center border" style={{ borderColor: 'var(--mist)', background: 'white' }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ filter: style.fx }} aria-hidden="true">
                                <path d="M3 15l9-9 9 9-9 3-9-3z" fill={style.fill} />
                              </svg>
                            </div>
                            <div>
                              <div className="font-seasons leading-tight">{rank}. {row.first_name || 'Anonymous'}</div>
                              <div className="text-xs" style={{ color: 'var(--ink-2)' }}>{row.country_code}</div>
                            </div>
                          </div>
                          <div className="font-bold" style={{ color: 'var(--teal)' }}>{row.boats_total}</div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Two-column section under hero */}
      <div className="mt-6 mx-auto max-w-5xl grid gap-6 lg:grid-cols-5">
        <section aria-label="Project intro" className="lg:col-span-3">
          <Hero />
        </section>
        <section aria-label="Bandcamp player" className="lg:col-span-2 lg:sticky lg:top-4 self-start">
          <BandcampEmbed />
        </section>
      </div>
    </div>
  );
}


