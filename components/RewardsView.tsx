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
  const [claimedAt, setClaimedAt] = useState<Record<string, string>>({});
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [activeRewardModal, setActiveRewardModal] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<string>("");

  const points = useMemo(() => getUserPoints(boatsTotal), [boatsTotal]);
  const currentTier = useMemo(() => {
    return [...REWARDS].filter(r => r.points <= points).sort((a, b) => b.points - a.points)[0] || null;
  }, [points]);
  const nextTier = useMemo(() => {
    return REWARDS.find(r => r.points > points) || null;
  }, [points]);
  const prevTierPoints = useMemo(() => {
    return currentTier?.points || 0;
  }, [currentTier]);
  const prevPointsRef = useRef<number>(points);
  useEffect(() => {
    try {
      const prev = prevPointsRef.current;
      if (points > prev) {
        const newly = [...REWARDS].filter(r => r.points > prev && r.points <= points).sort((a,b)=>a.points-b.points).pop();
        if (newly) setAnnounce(`Unlocked ${newly.title}`);
      }
      prevPointsRef.current = points;
    } catch {}
  }, [points]);

  async function handleClaim(tier: RewardConfig) {
    const supabase = getSupabase();
        const fireConfetti = (root: HTMLElement | null) => {
      if (!root) return;
      try {
        const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReduced) return;
        const container = document.createElement('div');
        container.setAttribute('aria-hidden', 'true');
        Object.assign(container.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '40' });
        root.appendChild(container);
        const colors = ['#66c2ff', '#ffd700', '#ff9f1c', '#2aa7b5', '#a78bfa'];
        const num = 24;
        for (let i=0;i<num;i++) {
          const s = document.createElement('span');
          const size = 6 + Math.random()*6;
          const x = Math.random()*100;
          const dx = (Math.random()*2-1)*40;
          const dur = 600 + Math.random()*500;
          s.style.position='absolute';
          s.style.left=`${x}%`; s.style.top='50%';
          s.style.width=`${size}px`; s.style.height=`${size}px`;
          s.style.background=colors[i%colors.length];
          s.style.borderRadius='1px';
          s.style.opacity='0.9';
          s.style.transform='translate(-50%, -50%)';
          s.style.transition=`transform ${dur}ms ease-out, opacity ${dur}ms ease-out`;
          container.appendChild(s);
          requestAnimationFrame(()=>{
            s.style.transform=`translate(${dx}px, ${-120-Math.random()*60}px)`;
            s.style.opacity='0';
          });
        }
        setTimeout(()=>{ container.remove(); }, 1200);
      } catch {}
    };
    if (tier.id === "r20" || tier.id === "r50" || tier.id === "r100") {
      try {
        setClaimingId(tier.id);
        setClaimedIds((ids) => (ids.includes(tier.id) ? ids : [...ids, tier.id]));
        setClaimedAt((m) => ({ ...m, [tier.id]: new Date().toISOString() }));
        fireConfetti(itemRefs.current[tier.id] || null);
        setActiveRewardModal(tier.id);
        setAnnounce("Reward claimed. Details available in View Reward.");
      } finally {
        setClaimingId(null);
      }
      return;
    }
    if (tier.id === "r150" || tier.id === "r250" || tier.id === "r400") {
      try {
        setClaimingId(tier.id);
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId) throw new Error("Not authenticated");
        const rewardId = tier.id === "r150" ? 150 : tier.id === "r250" ? 250 : 400;
        const payload = tier.id === "r150" ? { code: "BRONZE12" } : null;
        const { error } = await supabase
          .from("user_rewards")
          .upsert({ user_id: userId, reward_id: rewardId, payload }, { onConflict: "user_id,reward_id" });
        if (error) throw error;
        setClaimedIds((ids) => (ids.includes(tier.id) ? ids : [...ids, tier.id]));
        setClaimedAt((m) => ({ ...m, [tier.id]: new Date().toISOString() }));
        fireConfetti(itemRefs.current[tier.id] || null);
        setActiveRewardModal(tier.id);
        setAnnounce("Reward claimed. Details available in View Reward.");
      } catch {
        setAnnounce("Sorry, we couldn't claim that reward. Please try again.");
      } finally {
        setClaimingId(null);
      }
      return;
    }
    // Other rewards: keep existing optimistic flow only
    setClaimedIds((ids) => (ids.includes(tier.id) ? ids : [...ids, tier.id]));
    setClaimedAt((m) => ({ ...m, [tier.id]: new Date().toISOString() }));
    fireConfetti(itemRefs.current[tier.id] || null);
    setAnnounce("Reward claimed. Details available in View Reward.");
  }

  useEffect(() => {
    setTimeout(() => rewardsHeadingRef.current?.focus(), 0);
  }, []);

  // Shift SR/keyboard focus into the points modal when it opens
  useEffect(() => {
    if (pointsOpen) {
      setTimeout(() => pointsModalRef.current?.focus(), 0);
    }
  }, [pointsOpen]);

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
    <div role="region" aria-labelledby="rewards-title" className="rewards-body flex flex-col min-h-0 h-full">
      {/* Sticky header bar */}
      <div className="sticky top-0 z-10" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center justify-between px-2 py-2.5">
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-[24px] font-sans text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--teal)]"
            style={{ background: 'rgba(210, 245, 250, 0.85)', border: '1.5px solid rgba(19,94,102,0.35)', color: 'var(--ink)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Back</span>
          </button>
          <h4 id="rewards-title" ref={rewardsHeadingRef} tabIndex={-1} className="font-seasons text-lg" style={{ color: 'var(--ink)' }}>Rewards</h4>
          <button ref={pointsButtonRef} type="button" className="text-sm underline" aria-haspopup="dialog" aria-expanded={pointsOpen} onClick={() => setPointsOpen(true)}>How Points Work</button>
        </div>
        <div aria-live="polite" className="sr-only">{announce}</div>
      </div>

      {/* Scrollable content area below fixed header */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 md:space-y-4">

      <section aria-label="Rewards intro">
        <div className="rounded-[24px] border px-6 py-5 text-center" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)', boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}>
          <p className="opacity-80 text-base" style={{ color: 'var(--ink)' }}>Make the world a happier place. One boat at a time.</p>
        </div>
      </section>

      <section aria-label="Next reward">
        <div className="rounded-[24px] border px-4 py-3" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(102,194,255,0.6)', boxShadow: '0 0 10px rgba(102,194,255,0.35)' }}>
          <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Next Reward:</div>
          {nextTier ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-seasons text-lg" style={{ color: 'var(--ink)' }}>{nextTier.points} Boats – {nextTier.title}</h2>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'rgba(11,13,26,0.12)', color: 'var(--ink)' }}>+{Math.max(0, nextTier.points - points)} to unlock</span>
              </div>
              <div className="mt-1 text-sm opacity-80" style={{ color: 'var(--ink)' }}>{points} / {nextTier.points}</div>
              <div className="mt-2 h-2 w-full rounded-full overflow-hidden" style={{ background: 'rgba(11,13,26,0.15)', border: '1px solid rgba(11,13,26,0.25)' }} aria-hidden="true">
                {(() => { const denom = Math.max(1, nextTier.points - prevTierPoints); const pct = Math.max(0, Math.min(100, ((points - prevTierPoints) / denom) * 100)); return (
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: '#0E3E45', border: '1px solid rgba(255,255,255,0.35)' }} />
                ); })()}
              </div>
            </>
          ) : (
            <div className="text-base italic opacity-80">You’ve reached the final island. Thank you for guiding the river!</div>
          )}
        </div>
      </section>

      <section aria-label="Mystery hint">
        <div className="rounded-[24px] border px-4 py-3" style={{ background: 'rgba(210, 245, 250, 0.25)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)', boxShadow: '0 6px 16px rgba(0,0,0,0.04)' }}>
          <div className="text-base opacity-80 italic" style={{ color: 'var(--ink)' }}>
            When your river widens, something rare appears.
            <br />
            Keep sending boats—new shores rise from the mist.
            <br />
            The next island shows when the current grows.
            <br />
            Your boats are carving a path to something special.
          </div>
        </div>
      </section>

      {/* River spine with tier cards */}
      <section aria-label="Reward tiers">
        <div className="relative mx-auto max-w-md md:max-w-lg py-3">
          {/* Mobile left gradient spine */}
          <div className="md:hidden absolute left-0 top-0 bottom-0" style={{ width: 2, background: 'linear-gradient(180deg, #8EE5E9, rgba(142,229,233,0))' }} aria-hidden="true" />
          {/* Center spine on md+ */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 -translate-x-1/2" style={{ width: 1.5, background: 'linear-gradient(180deg, #8EE5E9, rgba(142,229,233,0))' }} aria-hidden="true" />
          <ul className="space-y-3">
            {(() => {
              const items: React.ReactElement[] = [];
              const locked = REWARDS.filter(r => r.points > points);
              const nextUp = locked[0] || null;
              const soon = locked[1] || null;
              const laterCount = Math.max(0, locked.length - 2);
              const unlocked = REWARDS.filter(r => r.points <= points);

              // Render unlocked tiers (claimable/claimed)
              unlocked.forEach((tier) => {
                const status: "claimable" | "claimed" = claimedIds.includes(tier.id) ? "claimed" : "claimable";
                const remaining = 0;
                items.push(
                  <li key={tier.id} className="relative" ref={(el) => { itemRefs.current[tier.id] = el; }}>
                    <div className={`absolute -top-3 md:left-1/2 md:-translate-x-1/2 left-0`} aria-hidden="true" style={{ transform: 'translateX(-50%)' }}>
                      <div className={`rounded-full opacity-100 drop-shadow-[0_0_8px_rgba(120,220,255,0.8)]`} style={{ width: 12, height: 12, background: 'var(--teal)' }} />
                    </div>
                    <div className={`relative group rounded-[24px] border px-4 py-3 overflow-hidden ${status === 'claimable' ? 'claimable-glow' : ''}`} style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)', boxShadow: 'inset 0 0 0 1px rgba(14,62,69,0.22), inset 0 -10px 24px rgba(14,62,69,0.18), 0 6px 16px rgba(0,0,0,0.05)' }}>
                      {status === 'claimed' && (
                        <div className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider" style={{ background: 'rgba(11,13,26,0.12)', color: 'var(--ink)' }}>
                          CLAIMED{claimedAt[tier.id] ? ` • ${new Date(claimedAt[tier.id]).toLocaleDateString()} ${new Date(claimedAt[tier.id]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </div>
                      )}
                      <h3 className="font-seasons text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>{tier.points} Boats – {tier.title}</h3>
                      {tier.subtitle ? (
                        <div className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>{tier.subtitle}</div>
                      ) : null}
                      <p className="text-base opacity-90" style={{ color: 'var(--ink)' }}>
                        {tier.id === 'r50' ? "Want to know what the songs sound like when we play them live?" : tier.id === 'r20' ? "You’ve reached the first island. Here’s an early look at the story behind Dream River." : tier.id === 'r100' ? "You can now send your message directly to the creators. Ask about the music, the process, or anything that moved you." : tier.id === 'r150' ? "You’ve reached the Bronze island — enjoy rare live takes and 50% off your first merch." : tier.id === 'r250' ? "You’ve reached the Silver island — glimpses of what’s to come, and an invitation to learn directly from Eshaan." : "You’ve reached the Golden island — thank you for guiding so many boats home. We’re going to send you an actual paper boat made by Eshaan and a special gift with it."}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        {status === "claimable" && (
                          <button
                            type="button"
                            className="rounded-md btn px-4 py-2 font-seasons focus-visible:ring-2 focus-visible:ring-[color:var(--teal)]"
                            onClick={() => handleClaim(tier)}
                            disabled={claimingId === tier.id}
                            aria-disabled={claimingId === tier.id}
                            style={{ background: '#0E3E45', border: '2px solid rgba(19,94,102,0.9)' }}
                          >
                            {claimingId === tier.id ? 'Claiming…' : 'Claim Reward'}
                          </button>
                        )}
                        {status === "claimed" && tier.id === 'r20' ? (
                          <a
                            href="https://www.eshaansood.in/dream-river"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md btn px-4 py-2 font-seasons focus-visible:ring-2 focus-visible:ring-[color:var(--teal)]"
                            style={{ background: '#0E3E45', border: '2px solid rgba(19,94,102,0.9)' }}
                          >
                            Watch Now
                          </a>
                        ) : null}
                        {status === "claimed" && tier.id === 'r50' ? (
                          <a
                            href="https://youtu.be/s29hw8VduGc?si=aqCLGeLQ_OyfgEMG"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md btn px-4 py-2 font-seasons focus-visible:ring-2 focus-visible:ring-[color:var(--teal)]"
                            style={{ background: '#0E3E45', border: '2px solid rgba(19,94,102,0.9)' }}
                          >
                            Watch Now
                          </a>
                        ) : null}
                        {status === "claimed" && tier.id === 'r100' && (
                          <button
                            type="button"
                            className="rounded-md btn px-4 py-2 font-seasons focus-visible:ring-2 focus-visible:ring-[color:var(--teal)]"
                            onClick={() => setActiveRewardModal(tier.id)}
                            style={{ background: '#0E3E45', border: '2px solid rgba(19,94,102,0.9)' }}
                          >
                            View Reward
                          </button>
                        )}
                        {status === "claimed" && tier.id === 'r250' && (
                          <button type="button" className="rounded-md btn px-4 py-2 font-seasons opacity-70 cursor-not-allowed" disabled aria-disabled="true">Claimed</button>
                        )}
                        {status === "claimed" && tier.id === 'r400' && (
                          <button type="button" className="rounded-md btn px-4 py-2 font-seasons opacity-70 cursor-not-allowed" disabled aria-disabled="true">Claimed</button>
                        )}
                        {status === "claimed" && tier.id !== 'r20' && tier.id !== 'r50' && tier.id !== 'r100' && tier.id !== 'r250' && tier.id !== 'r400' && (
                          <button type="button" className="rounded-md btn px-4 py-2 font-seasons opacity-70 cursor-not-allowed" disabled aria-disabled="true">Claimed</button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              });

              // Next up (first locked)
              if (nextUp) {
                const remaining = Math.max(0, nextUp.points - points);
                items.push(
                  <li key={nextUp.id} className="relative" ref={(el) => { itemRefs.current[nextUp.id] = el; }}>
                    <div className={`absolute -top-3 md:left-1/2 md:-translate-x-1/2 left-0`} aria-hidden="true" style={{ transform: 'translateX(-50%)' }}>
                      <div className={`rounded-full opacity-40`} style={{ width: 12, height: 12, background: 'var(--teal)' }} />
                    </div>
                    <div className="relative rounded-[24px] border px-4 py-3" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                      <h3 className="font-seasons text-lg font-semibold mb-1" style={{ color: 'var(--ink)', opacity: 0.95 }}>{nextUp.points} Boats – {nextUp.title}</h3>
                      {nextUp.subtitle ? (
                        <div className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)', opacity: 0.92 }}>{nextUp.subtitle}</div>
                      ) : null}
                      <div className="text-sm italic opacity-75" style={{ color: 'var(--ink)' }}>Something great lies beyond.</div>
                      <div className="mt-3 flex items-center gap-3">
                        <button type="button" className="rounded-md btn px-4 py-2 font-seasons opacity-70 cursor-not-allowed" disabled aria-disabled="true">Claim Reward</button>
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'rgba(11,13,26,0.12)', color: 'var(--ink)' }}>+{remaining} to unlock</span>
                      </div>
                    </div>
                  </li>
                );
              }

              // Soon (second locked)
              if (soon) {
                const remaining = Math.max(0, soon.points - points);
                items.push(
                  <li key={soon.id} className="relative" ref={(el) => { itemRefs.current[soon.id] = el; }}>
                    <div className={`absolute -top-3 md:left-1/2 md:-translate-x-1/2 left-0`} aria-hidden="true" style={{ transform: 'translateX(-50%)' }}>
                      <div className={`rounded-full opacity-30`} style={{ width: 12, height: 12, background: 'var(--teal)' }} />
                    </div>
                    <div className="relative rounded-[24px] border px-4 py-3" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                      <h3 className="font-seasons text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>{soon.points} Boats – {soon.title}</h3>
                      {soon.subtitle ? (
                        <div className="font-semibold text-sm mb-1" style={{ color: 'var(--ink)', opacity: 0.7 }}>{soon.subtitle}</div>
                      ) : null}
                      <div className="text-sm italic" style={{ color: 'var(--ink)' }}>Something great lies beyond.</div>
                      <div className="mt-2">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'rgba(11,13,26,0.12)', color: 'var(--ink)' }}>+{remaining} to unlock</span>
                      </div>
                    </div>
                  </li>
                );
              }

              // Later (grouped)
              if (laterCount > 0) {
                items.push(
                  <li key="later-group" className="relative">
                    <div className={`absolute -top-3 md:left-1/2 md:-translate-x-1/2 left-0`} aria-hidden="true" style={{ transform: 'translateX(-50%)' }}>
                      <div className={`rounded-full opacity-20`} style={{ width: 12, height: 12, background: 'var(--teal)' }} />
                    </div>
                    <div className="relative rounded-[24px] border px-4 py-3" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                      <div className="font-seasons text-lg font-semibold mb-1" style={{ color: 'var(--ink)' }}>And {laterCount} more islands ahead…</div>
                      <div className="text-sm italic opacity-80" style={{ color: 'var(--ink)' }}>Something great lies beyond.</div>
                    </div>
                  </li>
                );
              }

              return items;
            })()}
          </ul>
        </div>
      </section>

      </div>

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
      {(activeRewardModal === 'r20' || activeRewardModal === 'r50' || activeRewardModal === 'r100' || activeRewardModal === 'r250' || activeRewardModal === 'r400') && (
        <>
          <div className="fixed inset-0 z-[85] bg-black/45" aria-hidden="true" onClick={() => setActiveRewardModal(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={
              activeRewardModal === 'r20'
                ? 'r20-title'
                : activeRewardModal === 'r50'
                  ? 'r50-title'
                  : activeRewardModal === 'r100'
                    ? 'r100-title'
                    : activeRewardModal === 'r250'
                      ? 'r250-title'
                      : 'r400-title'
            }
            tabIndex={-1}
            className="fixed z-[90] inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-xl rounded-[24px] shadow-md p-6 outline-none"
            style={{ background: 'rgba(210,245,250,0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}
            onKeyDown={(e) => { if (e.key === 'Escape') setActiveRewardModal(null); trapFocus(e as unknown as React.KeyboardEvent<HTMLDivElement>); }}
          >
            <button aria-label="Close" className="absolute top-2 right-3 text-xl" onClick={() => setActiveRewardModal(null)}>×</button>
            <div className="reward-modal-content text-center">
              {activeRewardModal === 'r20' ? (
                <>
                  <h2 id="r20-title" className="font-seasons text-2xl mb-3">Check Out The Origin Story.</h2>
                  <p className="mb-2 text-base leading-relaxed">Come take a deeper peek behind the curtain.</p>
                  <p className="mb-4 text-sm italic opacity-80">Shhh. Don’t share this link with anyone. We’re trying to keep it secret.</p>
                  <a
                    href="https://www.eshaansood.in/dream-river"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center bg-[#0b0d1a] hover:brightness-110 text-white font-seasons text-lg px-6 py-2 rounded-xl transition-all"
                  >
                    Watch Now
                  </a>
                </>
              ) : activeRewardModal === 'r50' ? (
                <>
                  <h2 id="r50-title" className="font-seasons text-2xl mb-3">Watch A Show</h2>
                  <p className="mb-2 text-base leading-relaxed">This is a recording of our show from the Dream River Launch Tour in Boston. We collaborated with an amazing singer- Aditi Malhotra.</p>
                  <p className="mb-4 text-sm italic opacity-80">You can now watch this concert from the comfort of your home.</p>
                  <a
                    href="https://youtu.be/s29hw8VduGc?si=aqCLGeLQ_OyfgEMG"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center bg-[#0b0d1a] hover:brightness-110 text-white font-seasons text-lg px-6 py-2 rounded-xl transition-all"
                  >
                    Watch Now
                  </a>
                </>
              ) : activeRewardModal === 'r100' ? (
                <>
                  <h2 id="r100-title" className="font-seasons text-2xl mb-3">Have any questions whatsoever?</h2>
                  <p className="mb-2 text-base leading-relaxed">Ask Eshaan or any of the other members of the band.</p>
                  <form
                    action="https://formspree.io/f/xrbowlbr"
                    method="POST"
                    encType="multipart/form-data"
                    className="mt-4 space-y-4 text-left"
                  >
                    <div className="flex flex-col gap-1">
                      <label htmlFor="r100-name" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        Full Name
                      </label>
                      <input
                        id="r100-name"
                        name="full_name"
                        type="text"
                        required
                        className="rounded-lg border px-3 py-2"
                        style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)' }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="r100-email" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        Email
                      </label>
                      <input
                        id="r100-email"
                        name="email"
                        type="email"
                        required
                        className="rounded-lg border px-3 py-2"
                        style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)' }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="r100-question" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        Question / Comment
                      </label>
                      <textarea
                        id="r100-question"
                        name="question"
                        required
                        maxLength={500}
                        rows={5}
                        className="rounded-lg border px-3 py-2"
                        style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)', resize: 'vertical' }}
                      />
                      <div className="text-xs opacity-70" style={{ color: 'var(--ink)' }}>
                        500 character limit.
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center bg-[#0b0d1a] hover:brightness-110 text-white font-seasons text-lg px-6 py-2 rounded-xl transition-all"
                    >
                      Send Now
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <h2 id="r250-title" className="font-seasons text-2xl mb-3">Woah! You Made it!</h2>
                  <p className="mb-4 text-base leading-relaxed">Well, I honestly never thought anyone would get here. So I’m going to let you into my world for Album 2. And if you want to hang with me one on one and ask me about anything at all we can do that too.</p>
                  <form
                    action="https://formspree.io/f/meopbzgo"
                    method="POST"
                    encType="multipart/form-data"
                    className="mt-4 space-y-4 text-left"
                  >
                    <div className="flex flex-col gap-1">
                      <label htmlFor="r250-name" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        Full Name
                      </label>
                      <input
                        id="r250-name"
                        name="full_name"
                        type="text"
                        required
                        className="rounded-lg border px-3 py-2"
                        style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)' }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="r250-email" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                        Email
                      </label>
                      <input
                        id="r250-email"
                        name="email"
                        type="email"
                        required
                        className="rounded-lg border px-3 py-2"
                        style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)' }}
                      />
                    </div>
                    <fieldset className="flex flex-col gap-2" style={{ color: 'var(--ink)' }}>
                      <legend className="text-sm font-semibold">Wanna Hang/Study?</legend>
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="radio" name="wanna_hang" value="Yes" required />
                        Yes
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="radio" name="wanna_hang" value="No" required />
                        No
                      </label>
                    </fieldset>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center bg-[#0b0d1a] hover:brightness-110 text-white font-seasons text-lg px-6 py-2 rounded-xl transition-all"
                    >
                      Submit Now
                    </button>
                    <p className="text-xs opacity-70" style={{ color: 'var(--ink)' }}>
                      I’ll email you to co-ordinate times if you selected yes and send instructions for album 2 previews.
                    </p>
                  </form>
                </>
              )}
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
      {activeRewardModal === 'r400' && (
        <>
          <div className="fixed inset-0 z-[95] bg-black/45" aria-hidden="true" onClick={() => setActiveRewardModal(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="r400-title"
            tabIndex={-1}
            className="fixed z-[100] inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-xl rounded-[24px] shadow-md p-6 outline-none"
            style={{ background: 'rgba(210,245,250,0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}
            onKeyDown={(e) => { if (e.key === 'Escape') setActiveRewardModal(null); trapFocus(e as unknown as React.KeyboardEvent<HTMLDivElement>); }}
          >
            <button aria-label="Close" className="absolute top-2 right-3 text-xl" onClick={() => setActiveRewardModal(null)}>×</button>
            <div className="reward-modal-content text-center">
              <h2 id="r400-title" className="font-seasons text-2xl mb-3">No Way!</h2>
              <p className="mb-4 text-base leading-relaxed">
                Well, you did it! I am going to learn how to fold a paper boat blind and send you a goodie bag. Just drop in your details below. Thank you so much for spreading Dream River far and wide.
              </p>
              <form
                action="https://formspree.io/f/xvgvjqrq"
                method="POST"
                encType="multipart/form-data"
                className="mt-4 space-y-4 text-left"
              >
                <div className="flex flex-col gap-1">
                  <label htmlFor="r400-name" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    Full Name
                  </label>
                  <input
                    id="r400-name"
                    name="full_name"
                    type="text"
                    required
                    className="rounded-lg border px-3 py-2"
                    style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)' }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="r400-email" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    Email
                  </label>
                  <input
                    id="r400-email"
                    name="email"
                    type="email"
                    required
                    className="rounded-lg border px-3 py-2"
                    style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)' }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="r400-phone" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    Phone
                  </label>
                  <input
                    id="r400-phone"
                    name="phone"
                    type="tel"
                    required
                    className="rounded-lg border px-3 py-2"
                    style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)' }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="r400-address" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    Shipping Address
                  </label>
                  <textarea
                    id="r400-address"
                    name="shipping_address"
                    rows={3}
                    required
                    className="rounded-lg border px-3 py-2"
                    style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)', resize: 'vertical' }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="r400-comments" className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    Comments
                  </label>
                  <textarea
                    id="r400-comments"
                    name="comments"
                    rows={4}
                    required
                    className="rounded-lg border px-3 py-2"
                    style={{ borderColor: 'rgba(19,94,102,0.35)', background: 'rgba(255,255,255,0.9)', color: 'var(--ink)', resize: 'vertical' }}
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center bg-[#0b0d1a] hover:brightness-110 text-white font-seasons text-lg px-6 py-2 rounded-xl transition-all"
                >
                  Sail Away
                </button>
              </form>
            </div>
          </div>
        </>
      )}
      <style jsx>{`
        @keyframes gentlePulse {
          0%, 100% { box-shadow: 0 6px 16px rgba(0,0,0,0.05), 0 0 0 0 rgba(102, 194, 255, 0.0); }
          50% { box-shadow: 0 8px 20px rgba(0,0,0,0.08), 0 0 0 6px rgba(102, 194, 255, 0.25); }
        }
        .claimable-glow { animation: gentlePulse 1800ms ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .claimable-glow { animation: none; }
        }
        .claimable-glow:hover, .claimable-glow:focus-within { transform: translateY(-1px); transition: transform 180ms ease-out; }
        /* Body copy normal weight for readability */
        .rewards-body :where(p, .text-sm, .text-base, .font-sans, span, li, label, input, textarea) { font-weight: 400; }
      `}</style>
    </div>
  );
}
