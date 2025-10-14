"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import { useUser } from "@/hooks/useUser";
import Hero from "@/components/Hero";
import BandcampEmbed from "@/components/BandcampEmbed";
import dynamic from "next/dynamic";
// DashboardSheet is not used directly; inline overlay below owns the layout

const Globe = dynamic(() => import("@/components/Globe"), { ssr: false });

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
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);

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
                className={`absolute top-14 left-3 z-50 w-[88vw] ${guestStep === 'menu' ? 'md:w-[420px]' : 'md:w-[520px]'} bg-white rounded-lg shadow-xl border border-purple-200`}
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
                          onClick={() => setGuestStep('signup_email')}
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
                          <input className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                          <input className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                        </div>
                        <input className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <select className="border rounded-md px-3 py-2" style={{ background: "var(--white-soft)", color: "var(--ink)" }} value={country} onChange={(e) => setCountry(e.target.value)} required>
                            <option value="" disabled>Select your country</option>
                            <option value="US">United States</option>
                            <option value="GB">United Kingdom</option>
                            <option value="CA">Canada</option>
                            <option value="IN">India</option>
                            <option value="AU">Australia</option>
                            <option value="DE">Germany</option>
                            <option value="FR">France</option>
                            <option value="ES">Spain</option>
                            <option value="IT">Italy</option>
                            <option value="BR">Brazil</option>
                            <option value="SG">Singapore</option>
                            <option value="ZA">South Africa</option>
                            <option value="NG">Nigeria</option>
                            <option value="MX">Mexico</option>
                            <option value="JP">Japan</option>
                            <option value="CN">China</option>
                            <option value="TR">Turkey</option>
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
                          <div className="flex items-center gap-3">
                            <div className="rounded-full size-16 flex items-center justify-center border" style={{ background: "var(--white-soft)", borderColor: "var(--mist)" }} aria-label="Boat preview">
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M3 15l9-9 9 9-9 3-9-3z" fill={boatColor} />
                              </svg>
                            </div>
                            <input type="color" aria-label="Boat color" value={boatColor} onChange={(e) => setBoatColor(e.target.value)} className="h-10 w-10 rounded-full border" style={{ borderColor: "var(--mist)", background: "var(--white-soft)" }} />
                          </div>
                        </section>
                        <div className="flex items-center gap-3">
                          <button
                            className="rounded-md px-4 py-3 btn font-seasons flex-1"
                            disabled={loading || !firstName || !lastName || !email || !country || !favoriteSong}
                            onClick={async () => {
                              setLoading(true);
                              setAlert(null);
                              try {
                                const supabase = getSupabase();
                                const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
                                if (error) throw error;
                                setGuestStep('signup_code');
                                setAlert('We emailed you a 6-digit code. Enter it below.');
                              } catch (err: unknown) {
                                const msg = err instanceof Error ? err.message : 'Something went wrong';
                                setAlert(msg);
                              } finally {
                                setLoading(false);
                              }
                            }}
                          >
                            {loading ? 'Sending…' : 'Send Code'}
                          </button>
                          <button className="text-sm underline" onClick={() => setGuestStep('menu')}>Back</button>
                        </div>
                        {alert && <p className="text-sm">{alert}</p>}
                      </div>
                    )}

                    {guestStep === 'signup_code' && (
                      <div className="space-y-3">
                        <h2 className="font-seasons text-xl">Enter Code</h2>
                        <input className="border rounded-md px-3 py-2 bg-background tracking-widest text-center" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                        <div className="flex items-center gap-3">
                          <button
                            className="rounded-md px-4 py-3 btn flex-1"
                            disabled={loading || code.length !== 6}
                            onClick={async () => {
                              setLoading(true);
                              setAlert(null);
                              try {
                                const supabase = getSupabase();
                                const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
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
                                  setAlert('Verified! You are in.');
                                  setTimeout(() => setDashboardOpen(false), 900);
                                  return;
                                }
                                setAlert('Invalid code. Please try again.');
                              } catch (err: unknown) {
                                const msg = err instanceof Error ? err.message : 'Something went wrong';
                                setAlert(msg);
                              } finally {
                                setLoading(false);
                              }
                            }}
                          >
                            {loading ? 'Verifying…' : 'Verify'}
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
                            disabled={loading || !email}
                            onClick={async () => {
                              setLoading(true);
                              setAlert(null);
                              try {
                                const res = await fetch('/api/users/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
                                const json = await res.json();
                                if (!json.exists) {
                                  setAlert('No rivers found with that email address.');
                                  setGuestStep('signup_email');
                                  return;
                                }
                                const supabase = getSupabase();
                                const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
                                if (error) throw error;
                                setGuestStep('login_code');
                                setAlert('We emailed you a 6-digit code. Enter it below.');
                              } catch (e) {
                                setAlert('Unable to check river. Try again.');
                              } finally {
                                setLoading(false);
                              }
                            }}
                          >
                            {loading ? 'Sending…' : 'Send Code'}
                          </button>
                          <button className="text-sm underline" onClick={() => setGuestStep('menu')}>Back</button>
                        </div>
                        {alert && <p className="text-sm">{alert}</p>}
                      </div>
                    )}

                    {guestStep === 'login_code' && (
                      <div className="space-y-3">
                        <h2 className="font-seasons text-xl">Enter Code</h2>
                        <input className="border rounded-md px-3 py-2 bg-background tracking-widest text-center" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                        <div className="flex items-center gap-3">
                          <button
                            className="rounded-md px-4 py-3 btn flex-1"
                            disabled={loading || code.length !== 6}
                            onClick={async () => {
                              setLoading(true);
                              setAlert(null);
                              try {
                                const supabase = getSupabase();
                                const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
                                if (error) throw error;
                                if (data?.user) {
                                  setAlert('Welcome back!');
                                  setTimeout(() => setDashboardOpen(false), 900);
                                  return;
                                }
                                setAlert('Invalid code. Please try again.');
                              } catch (err: unknown) {
                                const msg = err instanceof Error ? err.message : 'Something went wrong';
                                setAlert(msg);
                              } finally {
                                setLoading(false);
                              }
                            }}
                          >
                            {loading ? 'Verifying…' : 'Verify'}
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


