"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { getSupabase } from "@/lib/supabaseClient";

type RewardType = "video" | "message" | "discount" | "lesson" | "shipping";

type RewardConfig = {
  id: string;
  points: number;
  title: string;
  subtitle?: string;
  type: RewardType;
  videoId: string | null;
  code: string | null;
  note: string;
};

// Add strict payload type for r150 (Bronze)
type BronzePayload = { code: string };

const REWARDS: RewardConfig[] = [
  { id: "r20", points: 20, title: "Watch The Documentary", type: "video", videoId: null, code: null, note: "" },
  { id: "r50", points: 50, title: "A Live Concert From the Comfort of Your Home", subtitle: "Exclusive Access To A Recorded Live Show", type: "video", videoId: null, code: null, note: "" },
  { id: "r100", points: 100, title: "Curiosity Killed The Cat", type: "message", videoId: null, code: null, note: "" },
  { id: "r150", points: 150, title: "Be Nobody Else Has These Songs", type: "discount", videoId: null, code: null, note: "" },
  { id: "r250", points: 250, title: "Want to Know The Future?", type: "lesson", videoId: null, code: null, note: "" },
  { id: "r400", points: 400, title: "The Golden Island", type: "shipping", videoId: null, code: null, note: "" },
];

type RewardsViewProps = {
  onBack: () => void;
  boatsTotal?: number;
};

function getUserPoints(boatsTotal: number | undefined): number {
  // For now, approximate points using boatsTotal as the available metric.
  // When degree breakdown is available, compute: 10*direct + 5*degree1 + 1*degree2plus.
  return Math.max(0, boatsTotal || 0);
}

export default function RewardsView({ onBack, boatsTotal = 0 }: RewardsViewProps) {
  const rewardsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const pointsModalRef = useRef<HTMLDivElement | null>(null);
  const pointsButtonRef = useRef<HTMLButtonElement | null>(null);

  const [pointsOpen, setPointsOpen] = useState(false);
  const [claimedIds, setClaimedIds] = useState<string[]>([]);
  const [activeRewardModal, setActiveRewardModal] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const points = useMemo(() => getUserPoints(boatsTotal), [boatsTotal]);
  const currentTier = useMemo(() => {
    return [...REWARDS].filter(r => r.points <= points).sort((a, b) => b.points - a.points)[0] || null;
  }, [points]);
  const nextTier = useMemo(() => {
    return REWARDS.find(r => r.points > points) || null;
  }, [points]);

  async function handleClaim(tier: RewardConfig) {
    const supabase = getSupabase();
    if (tier.id === "r150") {
      try {
        setClaimingId(tier.id);
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId) throw new Error("Not authenticated");
        const payload: BronzePayload = { code: "BRONZE12" };
        const { error } = await supabase
          .from("user_rewards")
          .upsert({ user_id: userId, reward_id: 150, payload }, { onConflict: "user_id,reward_id" });
        if (error) throw error;
        setClaimedIds((ids) => (ids.includes(tier.id) ? ids : [...ids, tier.id]));
        setActiveRewardModal(tier.id);
      } catch {
        // Silently ignore for now; keep UI responsive
      } finally {
        setClaimingId(null);
      }
      return;
    }
    // Other rewards: keep existing optimistic flow only
    setClaimedIds((ids) => (ids.includes(tier.id) ? ids : [...ids, tier.id]));
  }

  useEffect(() => {
    setTimeout(() => rewardsHeadingRef.current?.focus(), 0);
  }, []);

  const trapFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = e.currentTarget;
    const focusable = root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
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
    <div role="region" aria-labelledby="rewards-title" className="space-y-4 md:space-y-5">
      {/* Sticky header bar */}
      <div className="sticky top-0 z-10" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center justify-between px-2 py-3">
          <button type="button" className="text-sm underline" aria-label="Back" onClick={onBack}>Back</button>
          <h4 id="rewards-title" ref={rewardsHeadingRef} tabIndex={-1} className="font-seasons text-lg" style={{ color: 'var(--ink)' }}>Rewards</h4>
          <button ref={pointsButtonRef} type="button" className="text-sm underline" aria-haspopup="dialog" aria-expanded={pointsOpen} onClick={() => setPointsOpen(true)}>How Points Work</button>
        </div>
      </div>

      <section aria-label="Rewards intro">
        <div className="rounded-[24px] border p-6 text-center" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)', boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}>
          <p className="opacity-80 text-base" style={{ color: 'var(--ink)' }}>Make the world a happier place. One boat at a time.</p>
        </div>
      </section>

      <section aria-label="Next reward">
        <div className="rounded-[24px] border p-4" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(102,194,255,0.6)', boxShadow: '0 0 10px rgba(102,194,255,0.35)' }}>
          <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Next Reward:</div>
          {nextTier ? (
            <>
              <h2 className="font-seasons text-lg" style={{ color: 'var(--ink)' }}>{nextTier.points} Boats – {nextTier.title}</h2>
              <div className="text-base italic opacity-80">Only {Math.max(0, nextTier.points - points)} boats to go!</div>
            </>
          ) : (
            <div className="text-base italic opacity-80">You’ve reached the final island. Thank you for guiding the river!</div>
          )}
        </div>
      </section>

      <section aria-label="Mystery hint">
        <div className="rounded-[24px] border p-4" style={{ background: 'rgba(210, 245, 250, 0.25)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)', boxShadow: '0 6px 16px rgba(0,0,0,0.04)' }}>
          <div className="text-base opacity-80 italic" style={{ color: 'var(--ink)' }}>
            A rare island lies beyond…
            <br />
            Something special unlocks when your river flows further.
          </div>
        </div>
      </section>

      {/* River spine with tier cards */}
      <section aria-label="Reward tiers">
        <div className="relative mx-auto max-w-md md:max-w-lg py-4">
          {/* Mobile left gradient spine */}
          <div className="md:hidden absolute left-0 top-0 bottom-0" style={{ width: 2, background: 'linear-gradient(180deg, #8EE5E9, rgba(142,229,233,0))' }} aria-hidden="true" />
          {/* Center spine on md+ */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 -translate-x-1/2" style={{ width: 1.5, background: 'linear-gradient(180deg, #8EE5E9, rgba(142,229,233,0))' }} aria-hidden="true" />
          <ul className="space-y-4">
            {REWARDS.map((tier) => {
              const isUnlocked = points >= tier.points;
              const isMisted = !isUnlocked;
              const status: "locked" | "claimable" | "claimed" = isUnlocked
                ? (claimedIds.includes(tier.id) ? "claimed" : "claimable")
                : "locked";
              const remaining = Math.max(0, tier.points - points);
              return (
                <li key={tier.id} className="relative">
                  {/* Connector dot: left on mobile, center on md+ */}
                  <div className={`absolute -top-3 md:left-1/2 md:-translate-x-1/2 left-0`} aria-hidden="true" style={{ transform: 'translateX(-50%)' }}>
                    <div
                      className={`rounded-full ${isUnlocked ? 'opacity-100 drop-shadow-[0_0_8px_rgba(120,220,255,0.8)]' : 'opacity-40'} `}
                      style={{ width: 12, height: 12, background: 'var(--teal)' }}
                    />
                  </div>
                  <div className="relative group rounded-[24px] border p-4" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)', boxShadow: '0 6px 16px rgba(0,0,0,0.05)' }}>
                    {/* Mist overlay for future tiers */}
                    {isMisted && (
                      <div
                        className="absolute inset-0 z-0 rounded-2xl pointer-events-none transition-opacity duration-500 ease-in-out mist-overlay mix-blend-multiply backdrop-blur-[2px] group-hover:opacity-12 group-focus-within:opacity-12"
                        style={{ background: 'linear-gradient(180deg, rgba(9,11,26,0.4) 0%, rgba(11,13,26,0.25) 35%, rgba(130,180,255,0.15) 70%, rgba(255,255,255,0) 100%)' }}
                        aria-hidden="true"
                      >
                        {/* Vertical haze band aligned to spine */}
                        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[18px] rounded-full opacity-25 pointer-events-none group-hover:opacity-10 group-focus-within:opacity-10" style={{ background: 'linear-gradient(180deg, rgba(160,200,255,0.35), rgba(255,255,255,0))' }} />
                        <div
                          className="mist-drift absolute inset-0"
                          style={{
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(210,245,250,0.12) 40%, rgba(255,255,255,0) 100%)',
                            opacity: 0.08,
                            willChange: 'transform, opacity',
                            animation: 'mistDrift 30s ease-in-out infinite'
                          }}
                        />
                      </div>
                    )}
                    <div className="relative z-10">
                      <h3 className="font-seasons text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>{tier.points} Boats – {tier.title}</h3>
                      {tier.subtitle ? (
                        <div className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>{tier.subtitle}</div>
                      ) : null}
                      <p className={`text-base ${isMisted ? 'opacity-80' : 'opacity-90'}`} style={{ color: 'var(--ink)' }}>{tier.id === 'r50' ? "Want to know what the songs sound like when we play them live?" : tier.id === 'r20' ? "You’ve reached the first island. Here’s an early look at the story behind Dream River." : tier.id === 'r100' ? "You can now send your message directly to the creators. Ask about the music, the process, or anything that moved you." : tier.id === 'r150' ? "You’ve reached the Bronze island — enjoy rare live takes and 50% off your first merch." : tier.id === 'r250' ? "You’ve reached the Silver island — glimpses of what’s to come, and an invitation to learn directly from Eshaan." : "You’ve reached the Golden island — thank you for guiding so many boats home. We’re going to send you an actual paper boat made by Eshaan and a special gift with it."}</p>
                      <div className="mt-3 flex items-center gap-3">
                        {status === "locked" && (
                          <>
                            <button type="button" className="rounded-md btn px-4 py-2 font-seasons opacity-70 cursor-not-allowed" disabled aria-disabled="true">Claim Reward</button>
                            <span className="text-sm opacity-80" aria-live="polite">{remaining} boats to go</span>
                          </>
                        )}
                        {status === "claimable" && (
                          <button
                            type="button"
                            className="rounded-md btn px-4 py-2 font-seasons"
                            onClick={() => handleClaim(tier)}
                            disabled={claimingId === tier.id}
                            aria-disabled={claimingId === tier.id}
                          >
                            {claimingId === tier.id ? 'Claiming…' : 'Claim Reward'}
                          </button>
                        )}
                        {status === "claimed" && (
                          tier.id === 'r150' ? (
                            <button type="button" className="rounded-md btn px-4 py-2 font-seasons opacity-70 cursor-not-allowed" disabled aria-disabled="true">Claimed</button>
                          ) : (
                            <button type="button" className="rounded-md btn px-4 py-2 font-seasons">View Reward</button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {pointsOpen && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/40" aria-hidden="true" onClick={() => { setPointsOpen(false); setTimeout(() => pointsButtonRef.current?.focus(), 0); }} />
          <div
            ref={pointsModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="points-title"
            tabIndex={-1}
            className="fixed z-[90] inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-md rounded-[24px] shadow-md p-4 outline-none"
            style={{ background: 'rgba(210,245,250,0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setPointsOpen(false); setTimeout(() => pointsButtonRef.current?.focus(), 0); }
              trapFocus(e as unknown as React.KeyboardEvent<HTMLDivElement>);
            }}
          >
            <button aria-label="Close" className="absolute top-2 right-2 text-xl" onClick={() => { setPointsOpen(false); setTimeout(() => pointsButtonRef.current?.focus(), 0); }}>×</button>
            <h2 id="points-title" className="font-seasons text-lg mb-3 text-center">How Points Work</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="font-semibold">Direct Connection:</span> <span>10 points</span></div>
              <div className="flex items-center justify-between"><span className="font-semibold">1 Degree of Separation:</span> <span>5 points</span></div>
              <div className="flex items-center justify-between"><span className="font-semibold">2+ Degrees:</span> <span>1 point</span></div>
              <p className="mt-2 opacity-80 text-center">Your river grows with every connection. The more people you connect with, the further your current travels.</p>
            </div>
          </div>
        </>
      )}
      {/* 150 Boats one-time modal */}
      {activeRewardModal === 'r150' && (
        <>
          <div className="fixed inset-0 z-[95] bg-black/45" aria-hidden="true" onClick={() => setActiveRewardModal(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="r150-title"
            tabIndex={-1}
            className="fixed z-[100] inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-xl rounded-[24px] shadow-md p-6 outline-none"
            style={{ background: 'rgba(210,245,250,0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}
            onKeyDown={(e) => { if (e.key === 'Escape') setActiveRewardModal(null); trapFocus(e as unknown as React.KeyboardEvent<HTMLDivElement>); }}
          >
            <button aria-label="Close" className="absolute top-2 right-3 text-xl" onClick={() => setActiveRewardModal(null)}>×</button>
            <div className="reward-modal-content text-center">
              <h2 id="r150-title" className="font-seasons text-2xl mb-3">Your First Island!</h2>
              <p className="mb-4 text-base leading-relaxed">
                Make sure to write this code down somewhere and download these files right away since this reward won&apos;t be reclaimable.
              </p>
              <div className="inline-block mb-5 rounded-xl border-2 border-dotted border-[rgba(255,255,255,0.6)] px-5 py-3">
                <code className="font-mono text-xl tracking-wider select-text">BRONZE12</code>
              </div>
              <div className="flex flex-col items-center gap-3">
                <a
                  href="https://www.eshaansood.bandcamp.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#0b0d1a] hover:brightness-110 text-white font-seasons text-lg px-6 py-2 rounded-xl transition-all"
                >
                  Redeem On Bandcamp
                </a>
                <a
                  href="/Reward%20Songs.zip"
                  download
                  className="bg-teal-700 hover:bg-teal-800 text-white font-seasons text-lg px-6 py-2 rounded-xl transition-all"
                >
                  Download Songs
                </a>
              </div>
            </div>
          </div>
        </>
      )}
      <style jsx>{`
        @keyframes mistDrift {
          0%   { transform: translate3d(-12%, -8%, 0) scale(1.02); }
          50%  { transform: translate3d(10%, 8%, 0) scale(1.08); }
          100% { transform: translate3d(-12%, -8%, 0) scale(1.02); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mist-drift { animation: none !important; }
        }
        .mist-overlay { opacity: 0.45; }
      `}</style>
    </div>
  );
}
