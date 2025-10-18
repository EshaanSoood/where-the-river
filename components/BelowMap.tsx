"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import { getIsoCountries, type IsoCountry } from "@/lib/countryList";
import { useUser } from "@/hooks/useUser";
import Hero from "@/components/Hero";
import BandcampEmbed from "@/components/BandcampEmbed";
import dynamic from "next/dynamic";
import GlobeSummarySR from "@/components/GlobeSummarySR";
import ShareTiles from "@/components/ShareTiles";
import ColorChips from "@/components/ColorChips";
import LeftPanelEmbeds from "@/components/LeftPanelEmbeds";
import HowToPlayVideo from "@/components/HowToPlayVideo";
// DashboardSheet is not used directly; inline overlay below owns the layout

  const Globe = dynamic(() => import("@/components/GlobeRG"), { ssr: false });
  const RewardsView = dynamic(() => import("@/components/RewardsView"), { ssr: false });
  import { useMe } from "@/hooks/useMe";

  // Dashboard data bindings removed for overhaul; UI will use placeholders.

export default function BelowMap() {
  const router = useRouter();
  const [guestStep, setGuestStep] = useState<"menu" | "signup_email" | "signup_code" | "login_email" | "login_code">("menu");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [favoriteSong, setFavoriteSong] = useState("");
  const [boatColor, setBoatColor] = useState<string>("#135E66");
  const [code, setCode] = useState("");
  const [uiLoading, setUiLoading] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [lastOtpAt, setLastOtpAt] = useState<number>(0);
  const [countries, setCountries] = useState<IsoCountry[]>([]);

  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [globalBoats, setGlobalBoats] = useState<number | null>(null);
  const [top5, setTop5] = useState<{ first_name: string; country_code: string; boats_total: number }[]>([]);
  const [dashboardMode, setDashboardMode] = useState<"guest" | "user">("guest");
  const { me, refresh: refreshMe } = useMe();
  const [shareOpen, setShareOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  // Points modal state lives inside RewardsView now
  const [shareMessage, setShareMessage] = useState("Hey! I found this band called The Sonic Alchemists led by Eshaan Sood, a guitarist from India. They just put out an album and made a game for it. I’ve been listening to Dream River by them lately and I think you’ll enjoy it too.");
  
  const [announce, setAnnounce] = useState("");
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const leaderboardRef = useRef<HTMLDivElement | null>(null);
  const { user, loading } = useUser();
  const anyPanelOpen = dashboardOpen || leaderboardOpen;
  const [accOpen, setAccOpen] = useState<{ how: boolean; why: boolean; who: boolean }>({ how: false, why: false, who: false });
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const privacyRef = useRef<HTMLDivElement | null>(null);
  const privacyLinkRef = useRef<HTMLButtonElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const dashboardToggleRef = useRef<HTMLButtonElement | null>(null);
  const dashboardHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const shareHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  // Rewards handled within lazy-loaded RewardsView
  
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const dashboardFetchAttemptsRef = useRef<number>(0);

  useEffect(() => {
    const el = rightPanelRef.current;
    if (!el) return;
    const update = () => {
      try {
        const st = el.scrollTop;
        const ch = el.clientHeight;
        const sh = el.scrollHeight;
        setShowTopFade(st > 1);
        setShowBottomFade(st + ch < sh - 1);
      } catch {}
    };
    update();
    el.addEventListener('scroll', update, { passive: true } as AddEventListenerOptions);
    window.addEventListener('resize', update);
    return () => {
      try { el.removeEventListener('scroll', update as EventListener); } catch {}
      try { window.removeEventListener('resize', update); } catch {}
    };
  }, [rightPanelRef.current]);

  const rewardTiers: { boats: number; title: string; subtitle: string; copy: string }[] = [
    { boats: 20, title: "Watch The Documentary", subtitle: "Early access documentary", copy: "Unlocks early access to a short film about Dream River and the making of this project." },
    { boats: 50, title: "Q&A Livestream", subtitle: "Community Q&A session", copy: "Join a live Q&A to talk about the music, the globe, and the story behind the river." },
    { boats: 100, title: "Sticker Pack", subtitle: "Limited digital sticker set", copy: "Collect a set of limited artwork stickers to share and celebrate your river." },
    { boats: 150, title: "Behind the Scenes", subtitle: "Photo + notes pack", copy: "Peek into sketches, notes, and photos captured while making Dream River." },
    { boats: 250, title: "Listening Party", subtitle: "Invite-only listening room", copy: "An intimate group session to listen together and share stories along the river." },
    { boats: 400, title: "Signed Poster (Digital)", subtitle: "Digital signed artwork", copy: "Receive a signed digital poster to commemorate your river’s milestone." },
  ];

  // Data-binding fetches removed for overhaul

  // Lock body scroll while a panel is open and inert the rest of the page for SR/keyboard
  useEffect(() => {
    // If nocache requested, unregister service workers once to avoid stale bundles (Safari-friendly)
    try {
      const url = typeof window !== 'undefined' ? new URL(window.location.href) : null;
      if (url && url.searchParams.get('nocache') === '1' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => { regs.forEach((r) => r.unregister().catch(() => {})); }).catch(() => {});
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const update = () => {
        const shouldLock = anyPanelOpen;
        document.body.style.overflow = shouldLock ? 'hidden' : '';
        const inertify = (el: HTMLElement | null, on: boolean) => {
          if (!el) return;
          if (on) {
            el.setAttribute('inert', '');
            el.setAttribute('aria-hidden', 'true');
          } else {
            el.removeAttribute('inert');
            el.removeAttribute('aria-hidden');
          }
        };
        // Inert main content when any panel open
        inertify(headerRef.current, anyPanelOpen);
        inertify(contentRef.current, anyPanelOpen);
      };
      update();
      window.addEventListener('resize', update);
      return () => { window.removeEventListener('resize', update); };
    } catch {}
  }, [anyPanelOpen]);

  useEffect(() => {
    if (dashboardOpen && dashboardRef.current) {
      // Focus the heading first, else first focusable control
      const root = dashboardRef.current as HTMLElement;
      const focusTarget = (dashboardHeadingRef.current as HTMLElement) || root.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusTarget) focusTarget.focus();
    } else if (!dashboardOpen) {
      // Restore focus to the opener
      setTimeout(() => dashboardToggleRef.current?.focus(), 0);
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

  useEffect(() => {
    let isMounted = true;
    try {
      const list = getIsoCountries();
      if (isMounted) setCountries(list);
    } catch { setCountries([]); }
    return () => { isMounted = false; };
  }, []);

  // Refresh once dashboard opens in user mode
  useEffect(() => {
    if (!dashboardOpen || dashboardMode !== 'user') return;
    refreshMe().catch(() => {});
  }, [dashboardOpen, dashboardMode, refreshMe]);

  // Manage focus when switching into/out of the inline Share view
  useEffect(() => {
    if (shareOpen) {
      setTimeout(() => shareHeadingRef.current?.focus(), 0);
    }
  }, [shareOpen]);
  // RewardsView manages its own focus

  
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
    <div className="py-4 flex flex-col min-h-0 h-full">
      {/* Header inside site container; not sticky */}
      <div className="top-0 z-40 lg:sticky" style={{ ['--hdr' as unknown as string]: '40px' }}>
        <div className="relative" ref={headerRef}>
          <div
            className="min-h-10 py-1.5 flex items-center justify-center rounded-b-[24px] shadow-sm px-2"
            style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}
          >
            <div className="grid grid-cols-3 items-center gap-2 w-full">
              <div className="justify-self-start">
                {!loading && (
                  <button
                    ref={dashboardToggleRef}
                    type="button"
                    className="inline-flex items-center h-8 md:h-9 px-3 rounded-[24px] bg-white/85 backdrop-blur-sm border border-white/40 text-[color:var(--ink)] text-xs md:text-sm whitespace-nowrap overflow-hidden self-center shadow-sm"
                    aria-label={user ? "Open Dashboard" : "Participate / Log in"}
                    aria-controls="panel-dashboard"
                    aria-expanded={dashboardOpen}
                    onClick={() => {
                      if (user) {
                        setDashboardMode("user");
                        setDashboardOpen((v) => !v);
                      } else {
                        setDashboardMode("guest");
                        setGuestStep('menu');
                        setDashboardOpen(true);
                      }
                    }}
                  >
                    {user ? "Dashboard" : "Participate / Log in"}
                  </button>
                )}
              </div>
              <div className="justify-self-center w-full max-w-[560px] mx-auto px-2 min-w-0 text-center">
                <div className="lg:hidden">
                  <iframe
                    title="Bandcamp player (slim)"
                    aria-label="Bandcamp player for Dream River"
                    style={{ border: 0, width: '100%', height: 68 }}
                    src={`https://bandcamp.com/EmbeddedPlayer/album=672398703/size=small/bgcol=f7f0e4/linkcol=2aa7b5/transparent=true/`}
                    seamless
                  >
                    <a href="https://eshaansood.bandcamp.com/album/the-sonic-alchemists-i-dream-river">The Sonic Alchemists I: Dream River by Eshaan Sood</a>
                  </iframe>
                </div>
                <div
                  className="inline-block rounded-full px-3 py-1.5 align-middle"
                  style={{ background: 'rgba(11,13,26,0.80)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}
                >
                  <h1
                    className="font-seasons text-sm sm:text-base md:text-lg"
                    style={{ lineHeight: 1.2, textShadow: '0 1px 1px rgba(17,17,17,0.25)' }}
                  >
                    Dream River
                  </h1>
                </div>
              </div>
              <div className="justify-self-end">
                <button
                  type="button"
                  aria-label="Open Leaderboard"
                  aria-controls="panel-leaderboard"
                  aria-expanded={leaderboardOpen}
                  className="inline-flex items-center h-8 md:h-9 px-3 rounded-[24px] bg-white/85 backdrop-blur-sm border border-white/40 text-[color:var(--ink)] text-xs md:text-sm whitespace-nowrap overflow-hidden self-center shadow-sm"
                  onClick={() => setLeaderboardOpen((v) => !v)}
                  onKeyDown={(e) => { if (e.key === "Escape") setLeaderboardOpen(false); }}
                >
                  Leaderboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Margin handled by --section-gap on panels */}

      {/* Content Wrapper (fills leftover space between sticky header and footer) */}
      <div className="w-full flex-1 min-h-0 mt-0" ref={contentRef}>
        {/* Single SR summary for both layouts (avoid duplicate IDs across breakpoints) */}
        <GlobeSummarySR id="globe-sr-summary" />
        {/* Mobile / small-screen layout (<1024px) */}
        <div className="lg:hidden space-y-4">
          {/* Header now contains buttons and slim player; no title shown */}

          {/* Globe dominant section */}
          <section aria-label="Global participation">
            <div className="relative rounded-[24px] shadow-md overflow-hidden" style={{ background: '#0b0d1a' }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(6px)' }} />
              {/* Globe container uses viewport height to dominate; add bottom padding to allow heading peek */}
              <div className="relative w-full" style={{ height: "min(85vh, calc(100svh - 180px))" }}>
                <div className="absolute inset-0">
                  <Globe describedById="globe-sr-summary" ariaLabel="Interactive globe showing Dream River connections" tabIndex={0} />
                </div>
              </div>
            </div>
          </section>

          {/* Intro: Where The River Flows (always visible on mobile, not in accordion) */}
          <section aria-label="Project intro (mobile)">
            <div className="rounded-[24px] shadow-md p-4" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
              <Hero />
            </div>
          </section>

          {/* Accordions for remaining sections */}
          <div className="space-y-3">
            <div className="rounded-[24px] border" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
              <button
                className="w-full text-left px-3 py-3 font-semibold rounded-[24px]"
                aria-expanded={accOpen.how}
                aria-controls="acc-how"
                onClick={() => setAccOpen((o) => ({ ...o, how: !o.how }))}
              >
                How it works
              </button>
              {accOpen.how && (
                <div id="acc-how" role="region" aria-labelledby="acc-how-btn" className="px-3 pb-3 text-sm">
                  When you sign up, you’ll get a unique link to share with your friends. Each time someone joins through your link, your river grows. When they listen to the album and invite their own friends, their river connects to yours. Together, we can trace where the music flows — and as your chain grows, you collect paper boats that unlock exclusive perks.
                </div>
              )}
            </div>
            <div className="rounded-[24px] border" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
              <button
                className="w-full text-left px-3 py-3 font-semibold rounded-[24px]"
                aria-expanded={accOpen.why}
                aria-controls="acc-why"
                onClick={() => setAccOpen((o) => ({ ...o, why: !o.why }))}
              >
                Why
              </button>
              {accOpen.why && (
                <div id="acc-why" role="region" aria-labelledby="acc-why-btn" className="px-3 pb-3 text-sm">
                  I might be old school, but most of the music I treasure came from friends who shared it with me. While the internet keeps getting louder, I want to bring back that simple joy: discovering music from someone you know and trust.
                </div>
              )}
            </div>
            <div className="rounded-[24px] border" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
              <button
                className="w-full text-left px-3 py-3 font-semibold rounded-[24px]"
                aria-expanded={accOpen.who}
                aria-controls="acc-who"
                onClick={() => setAccOpen((o) => ({ ...o, who: !o.who }))}
              >
                Who I am
              </button>
              {accOpen.who && (
                <div id="acc-who" role="region" aria-labelledby="acc-who-btn" className="px-3 pb-3 text-sm">
                  I’m Eshaan Sood, a storyteller from New Delhi now in New York. My debut album Dream River is out everywhere — and this is my way of sending the boat sailing to every corner of the world.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop layout (≥1024px): 3 columns 1:2:1 over fluid container */}
        <div className="hidden lg:grid h-full min-h-0 gap-8 overflow-hidden items-start" style={{ gridTemplateColumns: '3fr 6fr 3fr', maxWidth: 'min(2048px, 92vw)', marginInline: 'auto' }}>
          {/* Left: single frosted panel with Bandcamp + divider + YouTube 16:9 */}
          <section aria-label="Bandcamp and YouTube" className="h-full min-h-0 min-w-0 overflow-hidden">
            <div className="h-full rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.25)] flex flex-col p-4" style={{ background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.35)', marginTop: 'var(--section-gap, 16px)' }}>
              <LeftPanelEmbeds />
            </div>
          </section>

          {/* Globe (center) */}
          <section aria-label="Global participation" className="min-w-0 h-full overflow-hidden">
            <div className="relative h-full rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.25)] overflow-hidden" style={{ background: 'rgba(11,13,26,0.80)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1.5px solid rgba(255,255,255,0.35)', marginTop: 'var(--section-gap, 16px)' }}>
              <div className="absolute inset-3 md:inset-4 min-h-0">
                <Globe describedById="globe-sr-summary" ariaLabel="Interactive globe showing Dream River connections" tabIndex={0} />
              </div>
            </div>
          </section>

          {/* Text block (right) */}
          <section aria-label="Project intro" className="min-w-0 h-full">
            <div
              className="h-full rounded-[24px] shadow-[0_10px_30px_rgba(0,0,0,0.25)] p-4 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--teal)] relative leading-normal text-[color:var(--ink)]"
              tabIndex={0}
              role="region"
              aria-label="About Dream River"
              style={{ scrollBehavior: (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth', background: 'rgba(210, 245, 250, 0.35)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.35)', marginTop: 'var(--section-gap, 16px)' }}
              ref={rightPanelRef}
            >
              <Hero />
              {showBottomFade && (
                <div aria-hidden="true" className="pointer-events-none bottom-0 -mx-4 z-50 lg:sticky">
                  <div className="h-10" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 100%)' }} />
                  <div className="text-center text-[color:var(--ink-2)] pb-1">…</div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Scrim for panels */}
      {anyPanelOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => { setDashboardOpen(false); setLeaderboardOpen(false); }}
        />
      )}

      {/* Slide-in Panels (fixed, above scrim) */}
      {dashboardOpen && (
        <div
          id="panel-dashboard"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-heading"
          className={`fixed inset-y-0 left-0 z-50 w-[88vw] max-w-sm lg:max-w-[520px] bg-white border-r border-purple-200 shadow-2xl overflow-y-auto focus:outline-none transform transition-transform duration-300 ease-out`}
          style={{ transform: "translateX(0)" }}
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
              {guestStep === 'menu' && (
                <div className="flex flex-col items-center justify-center gap-3 py-4">
                  <button
                    className="font-seasons rounded-md px-4 py-3 w-3/4"
                    style={{ background: "var(--teal)", color: "var(--parchment)", boxShadow: "0 6px 16px rgba(0,0,0,0.1)" }}
                    onClick={() => { setGuestStep('signup_email'); setTimeout(() => { const el = document.getElementById('firstNameField'); if (el) (el as HTMLInputElement).focus(); }, 0); }}
                  >
                    Start Your Boat
                  </button>
                  <button
                    className="font-seasons rounded-md px-4 py-3 w-3/4"
                    style={{ background: "var(--teal)", color: "var(--parchment)", boxShadow: "0 6px 16px rgba(0,0,0,0.1)" }}
                    onClick={() => setGuestStep('login_email')}
                  >
                    Resume Your River
                  </button>
                </div>
              )}
              {guestStep === 'signup_email' && (
                <div className="space-y-3">
                  <h2 className="font-seasons text-xl" style={{ color: "var(--teal)" }}>Start Your River</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input id="firstNameField" className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                    <input className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                  </div>
                  <input className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} value={country} onChange={(e) => setCountry(e.target.value)} required>
                      <option value="" disabled>Select your country</option>
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                    <select className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} value={favoriteSong} onChange={(e) => setFavoriteSong(e.target.value)} required>
                      <option value="" disabled>Favourite Song</option>
                      <option>Mountain Muse</option>
                      <option>Glass Blown Acquaintances</option>
                      <option>Miss Lightning</option>
                      <option>If Our Hearts Could Talk</option>
                      <option>Plea For Forgiveness</option>
                      <option>Here For A Good Time</option>
                      <option>Hexes and Spells</option>
                      <option>Sailing Through Dream River</option>
                    </select>
                  </div>
                  <section aria-label="Choose your boat" className="mt-2">
                    <h3 className="font-seasons text-lg mb-2" style={{ color: "var(--teal)" }}>Choose your boat</h3>
                    <div className="rounded-full size-16 mb-3 flex items-center justify-center border" style={{ background: "var(--white-soft)", borderColor: "var(--mist)" }} aria-label="Boat preview">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3 15l9-9 9 9-9 3-9-3z" fill={boatColor} />
                      </svg>
                    </div>
                    <ColorChips boatColor={boatColor} setBoatColor={setBoatColor} />
                  </section>
                        <div className="flex items-center gap-3">
                    <button
                      className="rounded-md px-4 py-3 btn font-seasons flex-1"
                      disabled={uiLoading || !firstName || !lastName || !email || !country || !favoriteSong || (Date.now() - lastOtpAt) < 60000}
                      onClick={async () => {
                        setUiLoading(true);
                        setAlert(null);
                        try {
                          const supabase = getSupabase();
                          const emailNorm = email.trim().toLowerCase();
                          // Preflight: does user already exist?
                          let exists = false;
                          try {
                            const r = await fetch('/api/users/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailNorm }) });
                            const j = await r.json();
                            exists = !!j?.exists;
                          } catch {}
                          if (exists) {
                            // Existing user → send login OTP and go to Screen D
                            const { error: signInErr } = await supabase.auth.signInWithOtp({ email: emailNorm, options: { shouldCreateUser: false } });
                            if (signInErr) throw signInErr;
                            setLastOtpAt(Date.now());
                            setGuestStep('login_code');
                            setAlert('We emailed you a 6-digit code. Enter it below.');
                          } else {
                            // New user → send signup OTP with metadata and go to Screen C
                            const { error: signUpErr } = await supabase.auth.signInWithOtp({
                              email: emailNorm,
                              options: {
                                shouldCreateUser: true,
                                data: {
                                  first_name: firstName.trim(),
                                  last_name: lastName.trim(),
                                  country_code: country,
                                  boat_color: boatColor,
                                  message: favoriteSong,
                                },
                              },
                            });
                            if (signUpErr) throw signUpErr;
                            setLastOtpAt(Date.now());
                            setGuestStep('signup_code');
                            setAlert('We emailed you a 6-digit code. Enter it below.');
                          }
                        } catch (err: unknown) {
                          const msg = err instanceof Error ? err.message : 'Something went wrong';
                          setAlert(msg);
                        } finally {
                          setUiLoading(false);
                        }
                      }}
                    >
                      {uiLoading ? 'Sending…' : ((Date.now() - lastOtpAt) < 60000 ? 'Please wait…' : 'Send Code')}
                    </button>
                    <button className="text-sm underline" onClick={() => setGuestStep('menu')}>Back</button>
                  </div>
                        {/* Legal disclaimer */}
                        <div className="mt-3 text-[0.85rem] opacity-80">
                          By clicking <strong>Send Code</strong>, you consent to receiving emails and agree to our{' '}
                          <button
                            ref={privacyLinkRef}
                            type="button"
                            role="link"
                            className="underline"
                            onClick={() => {
                              setPrivacyOpen(true);
                              setTimeout(() => { if (privacyRef.current) privacyRef.current.focus(); }, 0);
                            }}
                          >
                            Privacy Policy
                          </button>
                          . You can unsubscribe anytime.
                        </div>
                  {alert && <p className="text-sm">{alert}</p>}
                </div>
              )}

              {guestStep === 'signup_code' && (
                <div className="space-y-3">
                  <h2 className="font-seasons text-xl" style={{ color: 'var(--teal)' }}>Let’s Start Sailing.</h2>
                  <div className="text-sm" style={{ color: 'var(--ink-2)' }}>Enter the code we sent to start your journey.</div>
                  <input className="border rounded-md px-3 py-2 bg-background tracking-widest text-center" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                  <div className="flex items-center gap-3">
                    <button
                      className="rounded-md px-4 py-3 btn flex-1"
                      disabled={uiLoading || code.length !== 6}
                      onClick={async () => {
                        setUiLoading(true);
                        setAlert(null);
                        try {
                          const supabase = getSupabase();
                          const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' });
                          if (error) throw error;
                          if (data?.user) {
                            const name = `${firstName} ${lastName}`.trim();
                            const referral_id = Math.random().toString(36).slice(2, 10);
                            await fetch('/api/users/upsert', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                name,
                                email,
                                country_code: country,
                                message: favoriteSong,
                                photo_url: null,
                                referral_id,
                                referred_by: null,
                                boat_color: boatColor,
                              }),
                            });
                            // Immediately fetch dashboard data post-verification
                            // Data-binding removed; will rebuild
                            setAlert('Verified! You are in.');
                            setTimeout(() => setDashboardOpen(false), 900);
                            return;
                          }
                          setAlert('Invalid code. Please try again.');
                        } catch (err: unknown) {
                          const msg = err instanceof Error ? err.message : 'Something went wrong';
                          setAlert(msg);
                        } finally {
                          setUiLoading(false);
                        }
                      }}
                    >
                      {uiLoading ? 'Verifying…' : 'Verify'}
                    </button>
                    <button className="text-sm underline" onClick={() => setGuestStep('signup_email')}>Back</button>
                  </div>
                  {alert && <p className="text-sm">{alert}</p>}
                </div>
              )}

              {guestStep === 'login_email' && (
                <div className="space-y-3">
                  <h2 className="font-seasons text-xl">Resume your River</h2>
                  <input className="border rounded-md px-3 py-2 bg-background" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <div className="flex items-center gap-3">
                    <button
                      className="rounded-md px-4 py-3 btn flex-1"
                      disabled={uiLoading || !email || (Date.now() - lastOtpAt) < 60000}
                      onClick={async () => {
                        setUiLoading(true);
                        setAlert(null);
                        try {
                          // Always attempt OTP sign-in; fall back to signup if auth rejects
                          const supabase = getSupabase();
                          const emailNorm = email.trim().toLowerCase();
                          const { error } = await supabase.auth.signInWithOtp({ email: emailNorm, options: { shouldCreateUser: false } });
                          if (error) {
                            setAlert('No rivers found with that email address. You can start a new one.');
                            setGuestStep('signup_email');
                          } else {
                            setLastOtpAt(Date.now());
                            setGuestStep('login_code');
                            setAlert('We emailed you a 6-digit code. Enter it below.');
                          }
                        } catch (e) {
                          setAlert('Unable to send code. Try again.');
                        } finally {
                          setUiLoading(false);
                        }
                      }}
                    >
                      {uiLoading ? 'Sending…' : 'Send Code'}
                    </button>
                    <button className="text-sm underline" onClick={() => setGuestStep('menu')}>Back</button>
                  </div>
                  {alert && <p className="text-sm">{alert}</p>}
                </div>
              )}

              {guestStep === 'login_code' && (
                <div className="space-y-3">
                  <h2 className="font-seasons text-xl" style={{ color: 'var(--teal)' }}>Welcome Back.</h2>
                  <div className="text-sm" style={{ color: 'var(--ink-2)' }}>Enter the code we sent to resume your river.</div>
                  <input className="border rounded-md px-3 py-2 bg-background tracking-widest text-center" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                  <div className="flex items-center gap-3">
                    <button
                      className="rounded-md px-4 py-3 btn flex-1"
                      disabled={uiLoading || code.length !== 6}
                      onClick={async () => {
                        setUiLoading(true);
                        setAlert(null);
                        try {
                          const supabase = getSupabase();
                          const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
                          if (error) throw error;
                          if (data?.user) {
                            setAlert('Welcome back!');
                            // Data-binding removed; will rebuild
                            setTimeout(() => setDashboardOpen(false), 900);
                            return;
                          }
                          setAlert('Invalid code. Please try again.');
                        } catch (err: unknown) {
                          const msg = err instanceof Error ? err.message : 'Something went wrong';
                          setAlert(msg);
                        } finally {
                          setUiLoading(false);
                        }
                      }}
                    >
                      {uiLoading ? 'Verifying…' : 'Verify'}
                    </button>
                    <button className="text-sm underline" onClick={() => setGuestStep('login_email')}>Back</button>
                  </div>
                  {alert && <p className="text-sm">{alert}</p>}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100">
                <h3 ref={dashboardHeadingRef} id="dashboard-heading" tabIndex={-1} className="text-purple-900 font-semibold">Dashboard</h3>
                <button aria-label="Close dashboard" onClick={() => setDashboardOpen(false)} className="text-purple-800">✕</button>
              </div>
              <div className="p-4">
                {rewardsOpen ? (
                  <RewardsView boatsTotal={me?.boats_total ?? 0} onBack={() => { setRewardsOpen(false); setTimeout(() => dashboardHeadingRef.current?.focus(), 0); }} />
                ) : (
                <div className="space-y-4 md:space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="w-14 h-14 rounded-full overflow-hidden border" style={{ borderColor: 'var(--mist)' }} aria-label="Boat badge">
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--white-soft)' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 15l9-9 9 9-9 3-9-3z" fill={me?.boat_color || '#135E66'} />
                        </svg>
                      </div>
                    </div>
                    <div className="flex flex-col leading-tight">
                      <div className="font-seasons text-lg md:text-xl">{me?.name || ''}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-sans font-extrabold text-base md:text-lg">{me?.boats_total ?? 0}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[color:var(--ink-2)]">
                          <path d="M3 15l9-9 9 9-9 3-9-3z" fill="currentColor" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="font-sans text-sm md:text-base">Country : {me?.country_name || 'Country not set'}</div>

                  <div className="font-seasons text-base md:text-lg">{me?.message || '—'}</div>

                  <div className="space-y-2">
                          {!shareOpen && (
                      <button
                        ref={shareButtonRef}
                        className="w-full min-h-12 md:min-h-14 rounded-md btn font-seasons transition-all duration-300 ease-out"
                        aria-label="Share Your Boat"
                              onClick={() => setShareOpen(true)}
                        disabled={!me?.referral_url}
                      >
                        Share Your Boat
                      </button>
                    )}
                    {shareOpen && (
                          <div className="transition-all duration-300 ease-out" role="region" aria-labelledby="share-title">
                        <div className="flex items-center justify-between mb-2">
                          <button
                            className="text-sm underline"
                            onClick={() => { setShareOpen(false); setTimeout(() => shareButtonRef.current?.focus(), 0); }}
                            aria-label="Back"
                          >Back</button>
                          <div aria-live="polite" className="sr-only">{announce}</div>
                        </div>
                            <h4
                              id="share-title"
                              ref={shareHeadingRef}
                              tabIndex={-1}
                              className="font-seasons text-lg mb-2"
                              aria-label="Share"
                            >Share</h4>
                              <div className="grid grid-cols-2 gap-4">
                                <ShareTiles referralUrl={me?.referral_url || ''} message={shareMessage} userFullName={me?.name || ''} onCopy={(ok) => setAnnounce(ok ? 'Copied invite to clipboard' : '')} />
                              </div>
                        <div className="mt-3 space-y-2">
                          <label className="font-sans text-sm" htmlFor="shareMessage">Message</label>
                          <textarea id="shareMessage" className="w-full border rounded-md px-3 py-2" rows={4} value={shareMessage} onChange={(e) => setShareMessage(e.target.value)} />
                          <div className="flex items-center gap-2">
                            <input className="flex-1 border rounded-md px-3 py-2 bg-background" value={me?.referral_url || ''} readOnly aria-label="Referral link" />
                            <button
                              type="button"
                              className="rounded-md px-3 py-2 btn"
                              onClick={async () => { try { await navigator.clipboard.writeText(`${shareMessage} ${me?.referral_url || ''}`); setAnnounce('Copied invite to clipboard'); } catch {} }}
                            >Copy</button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="font-sans text-xs md:text-sm opacity-80">
                      Share your boat using this button to extend your river.
                    </div>
                  </div>

                  <div>
                  <div className="font-seasons text-base md:text-lg">Stream The Album</div>
                    <div className="mt-2 flex items-center gap-4 md:gap-6 flex-wrap">
                      <a href="https://open.spotify.com/album/1Tjrceud212g5KUcZ37Y1U?si=V4_K_uW5T0y-zd7sw481rQ&nd=1&dlsi=5c3cba22ef9f467e" target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                        <img src="/Streaming/Spotify.png" alt="Spotify" className="h-6 md:h-7 w-auto" />
                      </a>
                      <a href="https://music.apple.com/us/album/the-sonic-alchemists-i-dream-river/1837469371" target="_blank" rel="noopener noreferrer" aria-label="Listen on Apple Music">
                        <img src="/Streaming/Applemusic.png" alt="Apple Music" className="h-6 md:h-7 w-auto" />
                      </a>
                      <a href="https://www.youtube.com/playlist?list=OLAK5uy_kDt671HE3YUlBusqp-KMypwqupSNT0bJw" target="_blank" rel="noopener noreferrer" aria-label="Listen on YouTube Music">
                        <img src="/Streaming/Youtube.png" alt="YouTube Music" className="h-6 md:h-7 w-auto" />
                      </a>
                      <a href="https://eshaansood.bandcamp.com/" target="_blank" rel="noopener noreferrer" aria-label="Listen on Bandcamp">
                        <img src="/Streaming/Bandcamp.png" alt="Bandcamp" className="h-6 md:h-7 w-auto" />
                      </a>
                    </div>
                  </div>

                  <div>
                    <button className="w-full min-h-12 md:min-h-14 rounded-md btn font-seasons" aria-label="Redeem Rewards" onClick={() => { setRewardsOpen(true); setShareOpen(false); }}>
                      Redeem Rewards
                    </button>
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      aria-label="Log out"
                      className="w-full min-h-12 md:min-h-14 rounded-md btn font-seasons text-white"
                      onClick={async () => {
                        try {
                          const supabase = getSupabase();
                          await supabase.auth.signOut();
                        } catch {}
                        // Clear panel UI state only; user data is read via useMe
                        setShareOpen(false);
                        setDashboardMode("guest");
                        setGuestStep('menu');
                      }}
                    >
                      Log out
                    </button>
                  </div>
                </div>
                )}
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
          className="fixed inset-y-0 right-0 z-50 w-[88vw] max-w-sm lg:max-w-[420px] bg-white border-l border-purple-200 shadow-2xl overflow-y-auto focus:outline-none transform transition-transform duration-300 ease-out"
          style={{ transform: "translateX(0)" }}
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
                  1: { fill: '#d4af37', fx: 'drop-shadow(0 0 6px rgba(212,175,55,.6))' },
                  2: { fill: '#C0C0C0' },
                  3: { fill: '#cd7f32' },
                  4: { fill: '#8b5a2b' },
                  5: { fill: '#8b5a2b' },
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

      {/* Reduced motion: no slide animation */}
      <style jsx>{`
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] { transition: none !important; }
        }
      `}</style>
      {/* Privacy Policy Modal */}
      {privacyOpen && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/40" onClick={() => { setPrivacyOpen(false); setTimeout(() => privacyLinkRef.current?.focus(), 0); }} />
          <div
            ref={privacyRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-title"
            tabIndex={-1}
            className="fixed z-[90] inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-md rounded-[24px] shadow-md p-4 outline-none"
            style={{ background: 'rgba(210,245,250,0.35)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setPrivacyOpen(false); setTimeout(() => privacyLinkRef.current?.focus(), 0); } trapFocus(e as unknown as React.KeyboardEvent<HTMLDivElement>); }}
          >
            <button
              aria-label="Close Privacy Policy"
              className="absolute top-2 right-2 text-xl"
              onClick={() => { setPrivacyOpen(false); setTimeout(() => privacyLinkRef.current?.focus(), 0); }}
            >
              ×
            </button>
            <h2 id="privacy-title" className="font-seasons text-lg mb-2">Privacy Policy</h2>
            <ul className="list-disc pl-5 text-sm space-y-1">
              <li>We collect your name and email to create your account and show your river connections.</li>
              <li>We never sell or share your data with third parties.</li>
              <li>Data is securely stored on Supabase with industry-standard encryption.</li>
              <li>You can request deletion of your account anytime by emailing <a className="underline" href="mailto:contact@eshaansood.in">contact@eshaansood.net</a>.</li>
              <li>Emails are only sent with your consent, and you can unsubscribe at any time.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}


