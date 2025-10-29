"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import { getIsoCountries, type IsoCountry } from "@/lib/countryList";
import { useUser } from "@/hooks/useUser";
import { useMe } from "@/hooks/useMe";
import Hero from "@/components/Hero";
import BandcampEmbed from "@/components/BandcampEmbed";
import dynamic from "next/dynamic";
import GlobeSummarySR from "@/components/GlobeSummarySR";
import ShareTiles from "@/components/ShareTiles";
import ColorChips from "@/components/ColorChips";
import LeftPanelEmbeds from "@/components/LeftPanelEmbeds";
import HowToPlayVideo from "@/components/HowToPlayVideo";
// DashboardSheet is not used directly; inline overlay below owns the layout
// Client snapshot removed; use server-latched inviter only
import { refDebug } from "@/lib/refDebug";

  const Globe = dynamic(() => import("@/components/GlobeNew"), { ssr: false });
  const RewardsView = dynamic(() => import("@/components/RewardsView"), { ssr: false });

  // Dashboard data bindings removed for overhaul; UI will use placeholders.

type InitialInviter = { code: string | null; fullName: string | null; firstName: string | null; userId: string | null };
type BelowMapProps = { initialInviter?: InitialInviter | null };

// Removed client snapshot merging for server-only inviter UI

export default function BelowMap({ initialInviter }: BelowMapProps) {
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
  const [referralUrl, setReferralUrl] = useState<string>('');
  const [isLoadingReferral, setIsLoadingReferral] = useState<boolean>(true);
  const [shareLoading, setShareLoading] = useState(false);
  // Share uses referral_url from the unified dashboard payload
  const [rewardsOpen, setRewardsOpen] = useState(false);
  // Points modal state lives inside RewardsView now
  const [shareMessage, setShareMessage] = useState("Hey! I found this band called The Sonic Alchemists led by Eshaan Sood, a guitarist from India. They just put out an album and made a game for it. I've been listening to Dream River by them lately and I think you'll enjoy it too.");
  // Removed client-generated referral_id; canonical is minted server-side via SoT
  const [refInviterFirst, setRefInviterFirst] = useState<string | null>((initialInviter?.firstName || initialInviter?.fullName) || null);
  const [refInviterId, setRefInviterId] = useState<string | null>(initialInviter?.userId || null);
  const [inviterCode, setInviterCode] = useState<string>("");

  // 1) Latch SSR inviter so hydration cannot clear it
  const [inviter, setInviter] = useState<InitialInviter>({
    code: initialInviter?.code ?? null,
    firstName: initialInviter?.firstName ?? null,
    fullName: initialInviter?.fullName ?? null,
    userId: initialInviter?.userId ?? null,
  });

  // No client snapshot merge: SSR-only for inviter UI
  
  // Listen for global participate open requests (single source of truth)
  useEffect(() => {
    const onOpen = () => {
      try {
        setDashboardMode('guest');
        setGuestStep('menu');
        setDashboardOpen(true);
      } catch {}
    };
    try { window.addEventListener('participate:open', onOpen as EventListener); } catch {}
    return () => { try { window.removeEventListener('participate:open', onOpen as EventListener); } catch {} };
  }, []);

  // Capture referral code once (SSR code first, fallback to URL ?ref); keep as-is, show visibly, reuse in POST
  useEffect(() => {
    try {
      const fromSSR = (initialInviter?.code || "").trim();
      if (fromSSR) { setInviterCode(fromSSR); return; }
      const u = typeof window !== 'undefined' ? new URL(window.location.href) : null;
      const q = u ? (u.searchParams.get('ref') || '').trim() : '';
      if (q) setInviterCode(q);
    } catch {}
  }, [initialInviter?.code]);

  const [announce, setAnnounce] = useState("");
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const leaderboardRef = useRef<HTMLDivElement | null>(null);
  const { user, loading } = useUser();
  // Flip Share loading state once referral_url is present; auto-open once
  useEffect(() => {
    try {
      const url = (me?.referral_url || '') as string;
      if (isLoadingReferral) setIsLoadingReferral(false);
      if (url && url !== referralUrl) setReferralUrl(url);
    } catch {}
  }, [me?.referral_url, isLoadingReferral, referralUrl]);
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
  const lastReferralUrlRef = useRef<string | null>(null);
  const autoRefreshedRef = useRef<boolean>(false);

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
  }, [rightPanelRef]);

  const rewardTiers: { boats: number; title: string; subtitle: string; copy: string }[] = [
    { boats: 20, title: "Watch The Documentary", subtitle: "Early access documentary", copy: "Unlocks early access to a short film about Dream River and the making of this project." },
    { boats: 50, title: "Q&A Livestream", subtitle: "Community Q&A session", copy: "Join a live Q&A to talk about the music, the globe, and the story behind the river." },
    { boats: 100, title: "Sticker Pack", subtitle: "Limited digital sticker set", copy: "Collect a set of limited artwork stickers to share and celebrate your river." },
    { boats: 150, title: "Behind the Scenes", subtitle: "Photo + notes pack", copy: "Peek into sketches, notes, and photos captured while making Dream River." },
    { boats: 250, title: "Listening Party", subtitle: "Invite-only listening room", copy: "An intimate group session to listen together and share stories along the river." },
    { boats: 400, title: "Signed Poster (Digital)", subtitle: "Digital signed artwork", copy: "Receive a signed digital poster to commemorate your river's milestone." },
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

  // Remove separate session fetch; rely on useMe unified payload

  // Removed client referral update subscription for server-only inviter UI
  useEffect(() => {
    try {
      const update = () => {
        const shouldLock = false; // keep page scroll enabled; panels manage their own scroll
        document.body.style.overflow = '';
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

  // Mobile: tapping a heading scrolls it into view (avoid wall-of-text navigation issues)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      try {
        if (typeof window === 'undefined') return;
        if (window.innerWidth >= 1024) return; // mobile only
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const container = document.getElementById('mobile-intro');
        if (!container) return;
        if (!container.contains(target)) return;
        const heading = target.closest('h1, h2, h3, h4, h5, h6') as HTMLElement | null;
        if (!heading) return;
        // Smooth scroll the heading to the top of the viewport and focus it for AT
        heading.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        const prevTabIndex = heading.getAttribute('tabindex');
        if (!prevTabIndex) heading.setAttribute('tabindex', '-1');
        setTimeout(() => {
          try { heading.focus(); } catch {}
          if (!prevTabIndex) heading.removeAttribute('tabindex');
        }, 250);
      } catch {}
    };
    try { document.addEventListener('click', onClick, true as unknown as boolean); } catch {}
    return () => { try { document.removeEventListener('click', onClick, true as unknown as boolean); } catch {} };
  }, []);

  // Focus management: move focus to the first relevant input for each step
  useEffect(() => {
    try {
      if (guestStep === 'signup_email') {
        setTimeout(() => { const el = document.getElementById('firstNameField') as HTMLInputElement | null; el?.focus(); }, 0);
      } else if (guestStep === 'login_email') {
        setTimeout(() => { const el = document.getElementById('loginEmailField') as HTMLInputElement | null; el?.focus(); }, 0);
      } else if (guestStep === 'signup_code') {
        setTimeout(() => { const el = document.getElementById('signupCodeField') as HTMLInputElement | null; el?.focus(); }, 0);
      } else if (guestStep === 'login_code') {
        setTimeout(() => { const el = document.getElementById('loginCodeField') as HTMLInputElement | null; el?.focus(); }, 0);
      }
    } catch {}
  }, [guestStep]);

  // Refresh once dashboard opens in user mode
  useEffect(() => {
    if (!dashboardOpen || dashboardMode !== 'user') return;
    refreshMe().catch(() => {});
  }, [dashboardOpen, dashboardMode, refreshMe]);

  // Removed auto-refresh fallback; server ensures referral_url in single profile response

  // Dev-only: share mounted + pointer-events sanity
  useEffect(() => {
    try {
      refDebug('share-mounted', { meHasUrl: !!me?.referral_url, profileHasUrl: !!me?.referral_url });
      const btn = shareButtonRef.current;
      if (!btn) return;
      const style = getComputedStyle(btn);
      if (style.pointerEvents === 'none') {
        refDebug('overlay-blocking-clicks', { culpritSelector: 'button(self)' });
        (btn as HTMLButtonElement).style.pointerEvents = 'auto';
      }
      let p: HTMLElement | null = btn.parentElement as HTMLElement | null;
      while (p) {
        const ps = getComputedStyle(p);
        if (ps.pointerEvents === 'none') {
          refDebug('overlay-blocking-clicks', { culpritSelector: p.tagName.toLowerCase() });
          break;
        }
        p = p.parentElement as HTMLElement | null;
      }
    } catch {}
  }, [me?.referral_url]);

  const getReferralUrl = useCallback(async (): Promise<string> => {
    const stateUrl = referralUrl || (me?.referral_url || '') as string;
    if (stateUrl) return stateUrl;
    // Prefer profile store only; avoid calling a separate endpoint
    await refreshMe();
    const refreshed = (me?.referral_url || '') as string;
    if (refreshed) {
      try { setReferralUrl(refreshed); } catch {}
      return refreshed;
    }
    throw new Error('Referral link unavailable');
  }, [referralUrl, me?.referral_url, refreshMe]);

  const handleShareClick = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setShareLoading(true);
    try {
      await getReferralUrl();
      setShareOpen(true);
      setAnnounce('');
      refDebug('share-opened', { via: 'main-button' });
    } finally {
      setShareLoading(false);
    }
  }, [getReferralUrl]);

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

  // Compute display + guard once, prefer SSR values
  const name = inviter.firstName ?? inviter.fullName ?? null;
  const codeSnapSSRFirst = inviter.code ?? null;
  const showForGuest = Boolean(name || codeSnapSSRFirst);
  const showForSignedIn = Boolean(name || codeSnapSSRFirst) && (!user || (inviter.userId ? (user as { id?: string | null })?.id !== inviter.userId : true));
  const showHint = user ? showForSignedIn : showForGuest;

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
    <div className="pb-4 flex flex-col min-h-0 h-full">
      {/* Header inside site container; not sticky */}
      <div className="top-0 z-40 lg:sticky" style={{ ['--hdr' as unknown as string]: '40px' }}>
        <div className="relative page-container" ref={headerRef}>
          {/* Desktop unified header bar */}
          <div className="hidden lg:block header-bar">
            <div className="grid grid-cols-3 items-center w-full px-4 py-1 gap-4">
              {/* Left: Participate button */}
              <div className="justify-self-start pr-2 border-r" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                {!loading && (
                  user ? (
                    <button
                      ref={dashboardToggleRef}
                      type="button"
                      className="inline-flex items-center justify-center h-10 w-10 rounded-[16px] border text-[color:var(--ink)]"
                      style={{ background: 'rgba(42,167,181,0.15)', border: '1.5px solid rgba(255,255,255,0.25)' }}
                      aria-label="Dashboard"
                      aria-controls="panel-dashboard"
                      aria-expanded={dashboardOpen}
                      onClick={() => { setDashboardMode('user'); setDashboardOpen(v => !v); }}
                    >
                      <img src="/logos/bars-3.svg" alt="" width="18" height="18" aria-hidden="true" className="header-icon" />
                    </button>
                  ) : (
                    <button
                      ref={dashboardToggleRef}
                      type="button"
                      className="inline-flex items-center h-10 px-5 rounded-[24px] border text-[color:var(--navy)] text-sm whitespace-nowrap"
                      style={{ background: 'rgba(42,167,181,0.15)', border: '1.5px solid rgba(255,255,255,0.25)' }}
                      aria-label="Participate"
                      aria-controls="panel-dashboard"
                      aria-expanded={dashboardOpen}
                      onClick={() => { setDashboardMode('guest'); setGuestStep('menu'); setDashboardOpen(true); }}
                    >
                      Participate
                    </button>
                  )
                )}
              </div>
              
              {/* Center: True H1 (non-clickable semantic heading, no pill) */}
              <div className="justify-self-center w-full max-w-[560px] min-w-0 text-center px-2 border-x" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <h1 className="font-seasons text-white text-2xl font-semibold" style={{ lineHeight: 1.2, margin: 0 }} tabIndex={-1}>
                  Dream River
                </h1>
              </div>
              
              {/* Right: Leaderboard button */}
              <div className="justify-self-end pl-2 border-l" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <button
                  type="button"
                  aria-label="Open leaderboard"
                  aria-controls="panel-leaderboard"
                  aria-expanded={leaderboardOpen}
                  className="inline-flex items-center h-10 px-5 rounded-[24px] border text-[color:var(--navy)] text-sm whitespace-nowrap"
                  style={{ background: 'rgba(42,167,181,0.15)', border: '1.5px solid rgba(255,255,255,0.25)' }}
                  onClick={() => setLeaderboardOpen(v => !v)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setLeaderboardOpen(false); }}
                >
                  Leaderboard
                </button>
              </div>
            </div>
          </div>
          {/* Mobile header remains unchanged below */}
          <div className="lg:hidden">
            <div
              className="min-h-12 py-2.5 flex items-center justify-center rounded-b-[24px] shadow-sm px-2"
              style={{ background: 'rgba(19, 94, 102, 0.25)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}
            >
              <div className="grid grid-cols-3 items-center gap-2 w-full lg:[grid-template-columns:1fr_4fr_1fr]">
                <div className="justify-self-start lg:min-w-[176px]">
                  {!loading && (
                    user ? (
                      <button
                        ref={dashboardToggleRef}
                        type="button"
                        className="inline-flex items-center justify-center h-11 w-11 min-w-[44px] rounded-[24px] bg-white/85 backdrop-blur-sm border text-[color:var(--ink)] shadow-sm"
                        style={{ border: '1.5px solid rgba(255,255,255,0.25)' }}
                        aria-label="Dashboard"
                        aria-controls="panel-dashboard"
                        aria-expanded={dashboardOpen}
                        onClick={() => { setDashboardMode('user'); setDashboardOpen(v => !v); }}
                      >
                        <img src="/logos/bars-3.svg" alt="" width="18" height="18" aria-hidden="true" className="header-icon" />
                      </button>
                    ) : (
                      <button
                        ref={dashboardToggleRef}
                        type="button"
                        className="inline-flex items-center h-11 px-5 min-w-[176px] rounded-[24px] bg-white/85 backdrop-blur-sm border text-[color:var(--ink)] text-sm whitespace-nowrap overflow-hidden self-center shadow-sm"
                        style={{ border: '1.5px solid rgba(255,255,255,0.25)' }}
                        aria-label="Participate"
                        aria-controls="panel-dashboard"
                        aria-expanded={dashboardOpen}
                        onClick={() => { setDashboardMode('guest'); setGuestStep('menu'); setDashboardOpen(true); }}
                      >
                        Participate
                      </button>
                    )
                  )}
                </div>
                <div className="col-start-3 col-end-4 justify-self-end lg:min-w-[176px] w-full flex justify-end">
                  <button
                    type="button"
                    aria-label="Leaderboard"
                    aria-controls="panel-leaderboard"
                    aria-expanded={leaderboardOpen}
                    className="inline-flex items-center justify-center h-11 w-11 min-w-[44px] rounded-[24px] bg-white/85 backdrop-blur-sm border text-[color:var(--ink)] self-center shadow-sm"
                    style={{ border: '1.5px solid rgba(255,255,255,0.25)' }}
                    onClick={() => setLeaderboardOpen(v => !v)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setLeaderboardOpen(false); }}
                  >
                    <img src="/logos/trophy.svg" alt="" width="18" height="18" aria-hidden="true" className="header-icon" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Margin handled by --section-gap on panels */}

      {/* Content Wrapper (fills leftover space between sticky header and footer) */}
      <div className="w-full mt-0" style={{ flex: '1 1 auto', minHeight: 0 }} ref={contentRef}>
        {/* Single SR summary for both layouts (avoid duplicate IDs across breakpoints) */}
        <GlobeSummarySR id="globe-sr-summary" />
        {/* Mobile / small-screen layout (<1024px) */}
        <div className="lg:hidden space-y-4">
          {/* Slim Bandcamp player directly under the header, same horizontal space */}
          <section aria-label="Bandcamp player (mobile)">
            <div className="rounded-[16px] shadow p-2 overflow-hidden" style={{ background: 'rgba(19, 94, 102, 0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.25)' }}>
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
          </section>
          {/* Header now contains buttons and slim player; no title shown */}

          {/* Globe dominant section */}
          <section aria-label="Global participation">
            <div className="relative rounded-[24px] shadow-md overflow-hidden" style={{ background: '#0b0d1a' }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(6px)' }} />
              {/* Square globe container */}
              <div className="relative w-full grid place-items-center" style={{ aspectRatio: '1 / 1', padding: '16px' }}>
                <div className="relative w-full h-full max-w-full max-h-full" style={{ aspectRatio: '1 / 1' }}>
                  <Globe describedById="globe-sr-summary" ariaLabel="Interactive globe showing Dream River connections" tabIndex={0} />
                </div>
              </div>
            </div>
          </section>

          {/* How to play (YouTube) comes before text block on mobile */}
          <section aria-label="How to Play (mobile)">
            <div className="rounded-[24px] shadow-md p-3 overflow-hidden" style={{ background: 'rgba(19, 94, 102, 0.25)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
              <HowToPlayVideo />
            </div>
          </section>

          {/* Intro text block */}
          <section aria-label="Project intro (mobile)">
            <div id="mobile-intro" className="rounded-[24px] shadow-md p-4 overflow-hidden" style={{ background: 'rgba(19, 94, 102, 0.25)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
              <Hero />
            </div>
          </section>

          {/* Accordions for remaining sections */}
          <div className="space-y-3">
            <div className="rounded-[24px] border overflow-hidden" style={{ background: 'rgba(19, 94, 102, 0.25)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
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
                  <p>
                    When you sign up, you&apos;ll get a unique link to share with your friends. Each time someone joins through your link, your river grows. When they listen to the album and invite their own friends, their river connects to yours. Together, we can trace where the music flows — and as your chain grows, you collect paper boats that unlock exclusive perks.
                  </p>
                </div>
              )}
            </div>
            <div className="rounded-[24px] border overflow-hidden" style={{ background: 'rgba(19, 94, 102, 0.25)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
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
                  <p>
                    I might be old school, but most of the music I treasure came from friends who shared it with me. While the internet keeps getting louder, I want to bring back that simple joy: discovering music from someone you know and trust.
                  </p>
                </div>
              )}
            </div>
            <div className="rounded-[24px] border overflow-hidden" style={{ background: 'rgba(19, 94, 102, 0.25)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)' }}>
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
                  <p>
                    I&apos;m Eshaan Sood, a storyteller from New Delhi now in New York. My debut album &lsquo;Dream River&rsquo; is out everywhere — and this is my way of sending the boat sailing to every corner of the world.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop layout (≥1024px): 3 columns 1:2:1 over fluid container */}
        <div className="hidden lg:grid h-full min-h-0 gap-8 overflow-hidden page-container three-column-layout three-column-grid" style={{ gridTemplateColumns: '3fr 6fr 3fr', marginTop: '8px', marginBottom: '0', alignItems: 'stretch' }}>
          {/* Left: single frosted panel with Bandcamp + divider + YouTube 16:9 */}
          <section aria-label="Bandcamp and YouTube" className="min-w-0 flex" style={{ alignSelf: 'stretch' }}>
            <div className="relative w-full flex flex-col frosted-panel overflow-hidden" style={{ borderRadius: '24px', height: '100%' }}>
              <div className="flex-1 flex flex-col px-4 py-3 min-h-0">
                <LeftPanelEmbeds />
              </div>
              {/* Normalize ring across all panels for optical alignment */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[24px]" style={{ boxShadow: 'inset 0 0 0 8px rgba(255,255,255,0.04), inset 0 0 60px rgba(42,167,181,0.06)' }} />
            </div>
          </section>

          {/* Globe (center) - PERFECTLY CENTERED */}
          <section aria-label="Global participation" className="min-w-0 flex globe-section" style={{ alignSelf: 'stretch' }}>
            <div className="relative w-full rounded-[24px] overflow-hidden flex items-center justify-center globe-container" style={{ background: 'rgba(19, 94, 102, 0.25)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.25)', height: '100%' }}>
              {/* Globe container - square, centered, with equal inset */}
              <div className="relative globe-inner" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe describedById="globe-sr-summary" ariaLabel="Interactive globe showing Dream River connections" tabIndex={0} />
              </div>
              {/* Subtle inner glow ring to keep globe away from edges */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[24px]" style={{ boxShadow: 'inset 0 0 0 8px rgba(255,255,255,0.04), inset 0 0 60px rgba(42,167,181,0.08)', zIndex: 0 }} />
            </div>
          </section>

          {/* Text block (right) */}
          <section aria-label="Project intro" className="min-w-0 flex" style={{ alignSelf: 'stretch' }}>
            <div className="relative w-full frosted-panel overflow-hidden flex flex-col" style={{ borderRadius: '24px', height: '100%' }}>
              <div
                className="absolute inset-0 py-3 px-4 overflow-y-auto overflow-x-hidden outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--teal)] leading-relaxed text-[color:var(--ink)]"
                tabIndex={0}
                role="region"
                aria-label="About Dream River"
                style={{ scrollBehavior: (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth' }}
                ref={rightPanelRef}
                id="right-panel-content"
              >
                <Hero />
              </div>
              {/* Gradient fade - only visible when content overflows; locked to container bottom */}
              {showBottomFade && (
                <div aria-hidden="true" className="pointer-events-none absolute left-0 right-0 bottom-0 h-12 z-10" style={{ background: 'linear-gradient(to top, rgba(247, 240, 228, 0.95) 0%, rgba(247, 240, 228, 0) 100%)' }} />
              )}
              {/* Normalize ring across all panels for optical alignment */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[24px]" style={{ boxShadow: 'inset 0 0 0 8px rgba(255,255,255,0.04), inset 0 0 60px rgba(42,167,181,0.06)' }} />
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
          aria-describedby={showHint ? "inviter-line" : undefined}
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
              <div className="relative px-4 py-5" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
              <button
                aria-label="Close dashboard"
                onClick={() => setDashboardOpen(false)}
                className="absolute top-2 right-2 inline-flex items-center justify-center rounded-[24px] border px-2.5 py-1.5 text-sm"
                style={{ color: "var(--ink-2)", borderColor: 'var(--mist)', background: 'rgba(255,255,255,0.7)' }}
              >
                Close
              </button>
              {guestStep === 'menu' && (
                <div className="flex flex-col items-center justify-center gap-3 py-4">
                  {/* Invite hint (non-blocking), reserved space to avoid layout shift */}
                  <div className="min-h-5 leading-5 text-center font-sans" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                    {showHint && (
                      <p id="inviter-line" role="status" aria-live="polite" aria-atomic="true">
                        {name ? (<>
                          <strong className="font-bold" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>{name}</strong> sent their boat to your shore.
                        </>) : (
                          <>Someone invited you{codeSnapSSRFirst ? ` (code ${codeSnapSSRFirst})` : ''}.</>
                        )}
                      </p>
                    )}
                  </div>
                  {/* Consent UI removed: inviter UI is SSR-only */}
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
                    onClick={() => { setGuestStep('login_email'); setTimeout(() => { const el = document.getElementById('loginEmailField'); if (el) (el as HTMLInputElement).focus(); }, 0); }}
                  >
                    Resume Your River
                  </button>
                </div>
              )}
              {guestStep === 'signup_email' && (
                <div className="space-y-3">
                  {/* Invite hint (non-blocking) above form */}
                  <div className="min-h-5 leading-5 font-sans" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                    {showHint && (
                      <p id="inviter-line" role="status" aria-live="polite" aria-atomic="true">
                        {name ? (
                          <>Join <strong className="font-bold" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>{name}</strong>&apos;s river and start your own.</>
                        ) : (
                          <>Someone invited you{codeSnapSSRFirst ? ` (code ${codeSnapSSRFirst})` : ''}.</>
                        )}
                      </p>
                    )}
                  </div>
                  {/* Consent UI removed: inviter UI is SSR-only */}
                  <h2 className="font-seasons text-xl" style={{ color: "var(--teal)" }}>Start Your River</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input id="firstNameField" className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                    <input className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                  </div>
                  <input id="signupEmailField" className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
                  {/* Referral code (display, uneditable) */}
                  {inviterCode && (
                    <div className="grid grid-cols-1">
                      <label className="text-sm font-medium">Referral code</label>
                      <input id="referralCodeInput" className="border rounded-md px-3 py-2 bg-background" value={inviterCode} readOnly aria-label="Referral code" />
                    </div>
                  )}
                  <section aria-label="Choose your boat" className="mt-2">
                    <h3 className="font-seasons text-lg mb-2" style={{ color: "var(--teal)" }}>Choose your boat</h3>
                    <div className="rounded-full size-16 mb-3 flex items-center justify-center border" style={{ background: "var(--white-soft)", borderColor: "var(--mist)" }} aria-label="Boat preview">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ width: '70%', height: '70%' }}>
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
                          // No client prewarm; server profile is authoritative
                          if (exists) {
                            // Existing user → send login OTP and go to Screen D
                            const { error: signInErr } = await supabase.auth.signInWithOtp({ email: emailNorm, options: { shouldCreateUser: false } });
                            if (signInErr) throw signInErr;
                            setLastOtpAt(Date.now());
                            setGuestStep('login_code');
                            setAlert('We emailed you a 6-digit code. Enter it below.');
                          } else {
                            // New user → send signup OTP with metadata and go to Screen C
                          const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
                          const codeParam = inviterCode ? `?ref=${encodeURIComponent(inviterCode)}` : '';
                          const redirectTo = (typeof window !== 'undefined') ? `${window.location.origin}/auth/callback${codeParam}` : undefined;
                          
                          // Sanitize referral code - extract only numeric portion (6-12 digits)
                          const sanitizedRefCode = (() => {
                            const code = inviterCode || '';
                            const match = code.match(/(\d{6,12})/);
                            return match ? match[1] : '';
                          })();
                          
                            const { error: signUpErr } = await supabase.auth.signInWithOtp({
                              email: emailNorm,
                              options: {
                                shouldCreateUser: true,
                                data: {
                                name: fullName,
                                  first_name: firstName.trim(),
                                  last_name: lastName.trim(),
                                  country_code: country,
                                  boat_color: boatColor,
                                  message: favoriteSong,
                                  referred_by: sanitizedRefCode,
                                },
                                emailRedirectTo: redirectTo,
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
                  <h2 className="font-seasons text-xl" style={{ color: 'var(--teal)' }}>Let&apos;s Start Sailing.</h2>
                  <div className="text-sm" style={{ color: 'var(--ink-2)' }}>Enter the code we sent to start your journey.</div>
                  <input
                    className="border rounded-md px-3 py-2 bg-background tracking-widest text-center"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="••••••"
                    id="signupCodeField"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && code.length === 6 && !uiLoading) {
                        e.preventDefault();
                        setUiLoading(true);
                        setAlert(null);
                        try {
                          const supabase = getSupabase();
                          const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' });
                          if (error) throw error;
                          if (data?.user) {
                            const name = `${firstName} ${lastName}`.trim();
                            // Read referral code from multiple sources (in priority order)
                            // 1. From auth metadata (where it was stored during OTP signup)
                            // 2. From visible input
                            // 3. From state
                            let referredByCode = (data.user.user_metadata?.referred_by as string) || '';
                            if (!referredByCode) {
                              try {
                                const referralInput = document.getElementById('referralCodeInput') as HTMLInputElement | null;
                                referredByCode = referralInput?.value || inviterCode || '';
                              } catch {
                                referredByCode = inviterCode || '';
                              }
                            }
                            
                            const payload: Record<string, unknown> = {
                              name,
                              email,
                              country_code: country,
                              message: favoriteSong,
                              photo_url: null,
                              boat_color: boatColor,
                            };
                            {
                              const rb = (referredByCode || '').trim();
                              if (/^\d{6,12}$/.test(rb)) {
                                payload.referred_by = rb;
                              }
                            }
                            await fetch('/api/users/upsert', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(payload),
                            });
                            try { await refreshMe(); } catch {}
                            setDashboardMode('user');
                            setShareOpen(false);
                            setRewardsOpen(false);
                            setGuestStep('menu');
                            setAlert(null);
                            setDashboardOpen(true);
                            return;
                          }
                          setAlert('Please check the code you entered and try again.');
                        } catch (err: unknown) {
                          setAlert('Please check the code you entered and try again.');
                        } finally {
                          setUiLoading(false);
                        }
                      }
                    }}
                  />
                  {/* Referral code (display, uneditable) */}
                  {inviterCode && (
                    <div className="grid grid-cols-1">
                      <label className="text-sm font-medium">Referral code</label>
                      <input id="referralCodeInput" className="border rounded-md px-3 py-2 bg-background" value={inviterCode} readOnly aria-label="Referral code" />
                    </div>
                  )}
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
                            const referredByCode = inviterCode;
                            const payload2: Record<string, unknown> = {
                              name,
                              email,
                              country_code: country,
                              message: favoriteSong,
                              photo_url: null,
                              boat_color: boatColor,
                            };
                            {
                              const rb2 = (referredByCode || '').trim();
                              if (/^\d{6,12}$/.test(rb2)) {
                                (payload2 as Record<string, unknown>).referred_by = rb2;
                              }
                            }
                            await fetch('/api/users/upsert', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(payload2),
                            });
                            try { await refreshMe(); } catch {}
                            setDashboardMode('user');
                            setShareOpen(false);
                            setRewardsOpen(false);
                            setGuestStep('menu');
                            setAlert(null);
                            setDashboardOpen(true);
                            return;
                          }
                          setAlert('Please check the code you entered and try again.');
                        } catch (err: unknown) {
                          setAlert('Please check the code you entered and try again.');
                        } finally {
                          setUiLoading(false);
                        }
                      }}
                    >
                      {uiLoading ? 'Verifying…' : 'Verify'}
                    </button>
                    <button className="text-sm underline" onClick={() => setGuestStep('signup_email')}>Back</button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-sm underline"
                      disabled={(Date.now() - lastOtpAt) < 120000 || uiLoading}
                      onClick={async () => {
                        setUiLoading(true);
                        setAlert(null);
                        try {
                          const supabase = getSupabase();
                          const emailNorm = email.trim().toLowerCase();
                          const codeParam2 = inviterCode ? `?ref=${encodeURIComponent(inviterCode)}` : '';
                          const redirectTo2 = (typeof window !== 'undefined') ? `${window.location.origin}/auth/callback${codeParam2}` : undefined;
                          const { error: signUpErr } = await supabase.auth.signInWithOtp({
                            email: emailNorm,
                            options: {
                              shouldCreateUser: true,
                              data: {
                                name: `${firstName.trim()} ${lastName.trim()}`.trim(),
                                first_name: firstName.trim(),
                                last_name: lastName.trim(),
                                country_code: country,
                                boat_color: boatColor,
                                message: favoriteSong,
                              },
                              emailRedirectTo: redirectTo2,
                            },
                          });
                          if (signUpErr) throw signUpErr;
                          setLastOtpAt(Date.now());
                          setAlert('We sent you a new code. Please check your email.');
                        } catch {
                          setAlert('Unable to resend code. Please try again.');
                        } finally {
                          setUiLoading(false);
                        }
                      }}
                    >
                      Resend Code
                    </button>
                    {(Date.now() - lastOtpAt) < 120000 && (
                      <span className="text-xs opacity-80">Available in {Math.ceil((120000 - (Date.now() - lastOtpAt)) / 1000)}s</span>
                    )}
                  </div>
                  {alert && <p className="text-sm">{alert}</p>}
                </div>
              )}

              {guestStep === 'login_email' && (
                <div className="space-y-3">
                  <h2 className="font-seasons text-xl">Resume your River</h2>
                  <input id="loginEmailField" className="border rounded-md px-3 py-2 bg-background" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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
                  <input
                    className="border rounded-md px-3 py-2 bg-background tracking-widest text-center"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="••••••"
                    id="loginCodeField"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && code.length === 6 && !uiLoading) {
                        e.preventDefault();
                        setUiLoading(true);
                        setAlert(null);
                        try {
                          const supabase = getSupabase();
                          const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
                          if (error) throw error;
                          if (data?.user) {
                            try { await refreshMe(); } catch {}
                            setDashboardMode('user');
                            setShareOpen(false);
                            setRewardsOpen(false);
                            setGuestStep('menu');
                            setAlert(null);
                            setDashboardOpen(true);
                            return;
                          }
                          setAlert('Please check the code you entered and try again.');
                        } catch (err: unknown) {
                          setAlert('Please check the code you entered and try again.');
                        } finally {
                          setUiLoading(false);
                        }
                      }
                    }}
                  />
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
                            try { await refreshMe(); } catch {}
                            setDashboardMode('user');
                            setShareOpen(false);
                            setRewardsOpen(false);
                            setGuestStep('menu');
                            setAlert(null);
                            setDashboardOpen(true);
                            return;
                          }
                          setAlert('Please check the code you entered and try again.');
                        } catch (err: unknown) {
                          setAlert('Please check the code you entered and try again.');
                        } finally {
                          setUiLoading(false);
                        }
                      }}
                    >
                      {uiLoading ? 'Verifying…' : 'Verify'}
                    </button>
                    <button className="text-sm underline" onClick={() => setGuestStep('login_email')}>Back</button>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-sm underline"
                      disabled={(Date.now() - lastOtpAt) < 120000 || uiLoading}
                      onClick={async () => {
                        setUiLoading(true);
                        setAlert(null);
                        try {
                          const supabase = getSupabase();
                          const emailNorm = email.trim().toLowerCase();
                          const { error } = await supabase.auth.signInWithOtp({ email: emailNorm, options: { shouldCreateUser: false } });
                          if (error) throw error;
                          setLastOtpAt(Date.now());
                          setAlert('We sent you a new code. Please check your email.');
                        } catch {
                          setAlert('Unable to resend code. Please try again.');
                        } finally {
                          setUiLoading(false);
                        }
                      }}
                    >
                      Resend Code
                    </button>
                    {(Date.now() - lastOtpAt) < 120000 && (
                      <span className="text-xs opacity-80">Available in {Math.ceil((120000 - (Date.now() - lastOtpAt)) / 1000)}s</span>
                    )}
                  </div>
                  {alert && <p className="text-sm">{alert}</p>}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-purple-100">
                <h3 ref={dashboardHeadingRef} id="dashboard-heading" tabIndex={-1} className="text-purple-900 font-semibold">Dashboard</h3>
                <button
                  aria-label="Close dashboard"
                  onClick={() => setDashboardOpen(false)}
                  className="inline-flex items-center justify-center rounded-[24px] border px-3 py-1.5 text-sm"
                  style={{ color: 'var(--teal)', borderColor: 'var(--mist)', background: 'rgba(255,255,255,0.7)' }}
                >
                  Close
                </button>
              </div>
              <div className="px-4 py-5" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                {rewardsOpen ? (
                  <RewardsView boatsTotal={me?.boats_total ?? 0} onBack={() => { setRewardsOpen(false); setTimeout(() => dashboardHeadingRef.current?.focus(), 0); }} />
                ) : (
                <>
                  {/* Mobile layout (single-screen order) */}
                  <div className="md:hidden space-y-3">
                    {/* Top row: left badge, right counter + boat icon below */}
                    <div className="grid grid-cols-2 gap-3 items-start">
                      <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-full overflow-hidden border" style={{ borderColor: 'var(--mist)' }} aria-label="Boat badge">
                        <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--white-soft)' }}>
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ width: '70%', height: '70%' }}>
                              <path d="M3 15l9-9 9 9-9 3-9-3z" fill={me?.boat_color || '#135E66'} />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-sans font-extrabold text-base" style={{ color: 'var(--teal)', textShadow: '0 0 6px rgba(42,167,181,0.35)' }}>{me?.boats_total ?? 0}</div>
                        <div className="mt-1 inline-flex items-center justify-center">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[color:var(--ink-2)]">
                            <path d="M3 15l9-9 9 9-9 3-9-3z" fill="currentColor" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    {/* Name tile */}
                    <div className="rounded-[12px] px-3 py-2 font-seasons text-white" style={{ background: 'rgba(11,13,26,0.80)', border: '1px solid rgba(255,255,255,0.25)' }}>
                      <div className="text-lg">{me?.name || ''}</div>
                    </div>
                    {/* Share button */}
                    <button
                      ref={shareButtonRef}
                      className="w-full min-h-12 rounded-[24px] font-seasons text-white"
                      type="button"
                      aria-label="Share Your Boat"
                      onClick={handleShareClick}
                      style={{ background: 'var(--teal)' }}
                    >
                      Share Your Boat
                    </button>
                    {/* Helper copy (mobile) */}
                    <div className="font-sans text-sm opacity-80">Share your boat using this button to extend your river.</div>
                    {/* Streaming logos row (no heading) */}
                    <div id="dashboard-streaming" className="flex items-center justify-between gap-3 flex-wrap">
                      <a className="stream-btn" href="https://open.spotify.com/album/1Tjrceud212g5KUcZ37Y1U?si=V4_K_uW5T0y-zd7sw481rQ&nd=1&dlsi=5c3cba22ef9f467e" target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify"><span className="stream-icon spotify" aria-hidden="true" /></a>
                      <a className="stream-btn" href="https://music.apple.com/us/album/the-sonic-alchemists-i-dream-river/1837469371" target="_blank" rel="noopener noreferrer" aria-label="Listen on Apple Music"><span className="stream-icon applemusic" aria-hidden="true" /></a>
                      <a className="stream-btn" href="https://www.youtube.com/playlist?list=OLAK5uy_kDt671HE3YUlBusqp-KMypwqupSNT0bJw" target="_blank" rel="noopener noreferrer" aria-label="Listen on YouTube Music"><span className="stream-icon youtube" aria-hidden="true" /></a>
                      <a className="stream-btn" href="https://eshaansood.bandcamp.com/" target="_blank" rel="noopener noreferrer" aria-label="Listen on Bandcamp"><span className="stream-icon bandcamp" aria-hidden="true" /></a>
                    </div>
                    {/* Rewards and Logout */}
                    <button className="w-full min-h-12 rounded-[24px] font-seasons text-white" aria-label="Redeem Rewards" onClick={() => { setRewardsOpen(true); setShareOpen(false); }} style={{ background: 'var(--teal)' }}>
                      Redeem Rewards
                    </button>
                    <button
                      type="button"
                      aria-label="Log out"
                      className="w-full min-h-12 rounded-[24px] text-white font-sans font-bold"
                      onClick={async () => {
                        try {
                          const supabase = getSupabase();
                          await supabase.auth.signOut();
                        } catch {}
                        setShareOpen(false);
                        setDashboardMode('guest');
                        setGuestStep('menu');
                      }}
                      style={{ background: 'var(--teal)' }}
                    >
                      Log out
                    </button>
                  </div>

                  {/* Desktop layout remains unchanged */}
                  <div className="hidden md:block">
                    <div className="space-y-4 md:space-y-5">
                      <div className="px-2 sm:px-3">
                        <div className="flex items-center justify-between gap-5">
                          <div className="w-14 h-14 rounded-full overflow-hidden border" style={{ borderColor: 'var(--mist)' }} aria-label="Boat badge">
                          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--white-soft)' }}>
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ width: '70%', height: '70%' }}>
                                <path d="M3 15l9-9 9 9-9 3-9-3z" fill={me?.boat_color || '#135E66'} />
                              </svg>
                            </div>
                          </div>
                          <div className="flex flex-col leading-snug">
                            <div className="font-seasons text-2xl mt-1 mb-1">{me?.name || ''}</div>
                            <div className="flex items-center gap-2">
                              <span className="font-sans font-extrabold text-base" style={{ color: 'var(--teal)', textShadow: '0 0 6px rgba(42,167,181,0.35)' }}>{me?.boats_total ?? 0}</span>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[color:var(--ink-2)]">
                                <path d="M3 15l9-9 9 9-9 3-9-3z" fill="currentColor" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="font-sans text-base">Country : {me?.country_name || 'Country not set'}</div>
                      <div className="font-seasons text-lg">{me?.message || '—'}</div>

                      <div className="space-y-2">
                        {!shareOpen && (
                          <button
                            ref={shareButtonRef}
                            className="w-full min-h-14 rounded-[24px] font-seasons text-white transition-all duration-300 ease-out"
                            type="button"
                            aria-label="Share Your Boat"
                            onClick={handleShareClick}
                            style={{ background: 'var(--teal)' }}
                          >
                            Share Your Boat
                          </button>
                        )}
                        {shareOpen && (
                          <div className="transition-all duration-300 ease-out" role="region" aria-labelledby="share-title">
                            <div className="flex items-center justify-between mb-2">
                              <button className="text-sm underline" onClick={() => { setShareOpen(false); setTimeout(() => shareButtonRef.current?.focus(), 0); }} aria-label="Back">Back</button>
                              <div aria-live="polite" className="sr-only">{announce}</div>
                            </div>
                            <h4 id="share-title" ref={shareHeadingRef} tabIndex={-1} className="font-seasons text-lg mb-2" aria-label="Share">Share</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <ShareTiles referralUrl={referralUrl} message={shareMessage} userFullName={me?.name || ''} onCopy={(ok) => setAnnounce(ok ? 'Copied invite to clipboard' : '')} />
                            </div>
                            <div className="mt-3 space-y-2">
                              <label className="font-sans text-sm" htmlFor="shareMessage">Message</label>
                              <textarea id="shareMessage" className="w-full border rounded-md px-3 py-2" rows={4} value={shareMessage} onChange={(e) => setShareMessage(e.target.value)} />
                              <div className="flex items-center gap-2">
                                <input className="flex-1 border rounded-md px-3 py-2 bg-background" value={(me?.referral_url || '') as string} readOnly aria-label="Referral link" />
                                <button type="button" className="rounded-md px-3 py-2 btn" onClick={async () => { try { await navigator.clipboard.writeText(`${shareMessage} ${(me?.referral_url || '') as string}`); setAnnounce('Copied invite to clipboard'); } catch {} }}>Copy</button>
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="font-sans text-sm opacity-80">Share your boat using this button to extend your river.</div>
                      </div>

                      <div>
                        <div className="font-seasons text-lg">Stream The Album</div>
                        <div id="dashboard-streaming-desktop" className="mt-2 flex items-center gap-4 flex-wrap">
                          <a className="stream-btn" href="https://open.spotify.com/album/1Tjrceud212g5KUcZ37Y1U?si=V4_K_uW5T0y-zd7sw481rQ&nd=1&dlsi=5c3cba22ef9f467e" target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify"><span className="stream-icon spotify" aria-hidden="true" /></a>
                          <a className="stream-btn" href="https://music.apple.com/us/album/the-sonic-alchemists-i-dream-river/1837469371" target="_blank" rel="noopener noreferrer" aria-label="Listen on Apple Music"><span className="stream-icon applemusic" aria-hidden="true" /></a>
                          <a className="stream-btn" href="https://www.youtube.com/playlist?list=OLAK5uy_kDt671HE3YUlBusqp-KMypwqupSNT0bJw" target="_blank" rel="noopener noreferrer" aria-label="Listen on YouTube Music"><span className="stream-icon youtube" aria-hidden="true" /></a>
                          <a className="stream-btn" href="https://eshaansood.bandcamp.com/" target="_blank" rel="noopener noreferrer" aria-label="Listen on Bandcamp"><span className="stream-icon bandcamp" aria-hidden="true" /></a>
                        </div>
                      </div>

                      <div>
                        <button className="w-full min-h-14 rounded-[24px] font-seasons text-white" aria-label="Redeem Rewards" onClick={() => { setRewardsOpen(true); setShareOpen(false); }} style={{ background: 'var(--teal)' }}>
                          Redeem Rewards
                        </button>
                      </div>
                      <div className="mt-2">
                        <button type="button" aria-label="Log out" className="w-full min-h-14 rounded-[24px] text-white font-sans font-bold" onClick={async () => { try { const supabase = getSupabase(); await supabase.auth.signOut(); } catch {} setShareOpen(false); setDashboardMode('guest'); setGuestStep('menu'); }} style={{ background: 'var(--teal)' }}>
                          Log out
                        </button>
                      </div>
                    </div>
                  </div>
                </>
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
            <button
              aria-label="Close leaderboard"
              onClick={() => setLeaderboardOpen(false)}
              className="inline-flex items-center justify-center rounded-[24px] border px-3 py-1.5 text-sm"
              style={{ color: 'var(--teal)', borderColor: 'var(--mist)', background: 'rgba(255,255,255,0.7)' }}
            >
              Close
            </button>
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
        /* Header icons: same visual treatment as footer icons */
        .header-icon { width: 18px; height: 18px; filter: opacity(0.8) drop-shadow(0 0 2px rgba(0,0,0,0.35)) hue-rotate(160deg) saturate(120%); }
        /* Right column typography: clearer subheads and comfortable line height */
        #right-panel-content { --line-ch: 14ch; color: #0b0d1a; }
        #right-panel-content p { color: #0b0d1a; line-height: 1.7; margin: 0 0 1rem 0; max-width: var(--line-ch); font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "Noto Sans", sans-serif; }
        #right-panel-content li { color: #0b0d1a; max-width: var(--line-ch); }
        #right-panel-content a { color: var(--teal); text-underline-offset: 2px; }
        #right-panel-content h1, #right-panel-content h2, #right-panel-content h3 {
          font-family: var(--font-seasons, 'Seasons', serif);
          color: #0a0c10;
          line-height: 1.35;
          margin: 1.5rem 0 1rem 0; /* generous space around headings */
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        #right-panel-content ul, #right-panel-content ol { margin: 0.8rem 0 0.9rem 1.25rem; line-height: 1.6; }
        /* Mobile intro: make headings obvious and avoid wall of text */
        @media (max-width: 1023px) {
          #mobile-intro p { line-height: 1.65; margin: 0 0 0.95rem 0; }
          #mobile-intro h2, #mobile-intro h3 {
            font-weight: 700;
            line-height: 1.3;
            margin: 1rem 0 0.5rem 0;
            letter-spacing: 0.01em;
          }
          #mobile-intro h2 { font-size: 1.125rem; }
          #mobile-intro h3 { font-size: 1rem; }
          #mobile-intro ul, #mobile-intro ol { margin: 0.75rem 0 0.9rem 1.1rem; line-height: 1.65; }
        }
        /* Overlay buttons: consistent 24px rounded corners */
        #panel-dashboard button { border-radius: 24px; }
        #panel-leaderboard button { border-radius: 24px; }
        /* Streaming icons: uniform size, teal tint @ 80% */
        .stream-btn { display: inline-flex; width: 44px; height: 44px; align-items: center; justify-content: center; border-radius: 12px; background: rgba(42,167,181,0.08); }
        .stream-icon { display: inline-block; width: 28px; height: 28px; background-color: #135E66; -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-size: contain; mask-repeat: no-repeat; mask-position: center; }
        .stream-icon.spotify { -webkit-mask-image: url('/Streaming/pngs/spotify.png'); mask-image: url('/Streaming/pngs/spotify.png'); }
        .stream-icon.applemusic { -webkit-mask-image: url('/Streaming/pngs/applemusic.png'); mask-image: url('/Streaming/pngs/applemusic.png'); }
        .stream-icon.youtube { -webkit-mask-image: url('/Streaming/pngs/youtube.png'); mask-image: url('/Streaming/pngs/youtube.png'); }
        .stream-icon.bandcamp { -webkit-mask-image: url('/Streaming/pngs/bandcamp.png'); mask-image: url('/Streaming/pngs/bandcamp.png'); }
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


