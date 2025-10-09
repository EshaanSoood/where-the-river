"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";

type Props = {
  open: boolean;
  onClose: () => void;
  isLoggedIn?: boolean;
};

type Step =
  | "home"
  | "signup_email"
  | "signup_code"
  | "login_email"
  | "login_code"
  | "profile";

type Profile = {
  name: string | null;
  email: string;
  city: string | null;
  message: string | null;
  referral_id: string;
};

export default function DashboardSheet({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>("home");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [userMessage, setUserMessage] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("home");
      setEmail("");
      setCode("");
      setAlert(null);
      setProfile(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data }) => {
        const em = data.session?.user?.email ?? null;
        setSessionEmail(em);
        if (em) {
          fetch("/api/users/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }) })
            .then((r) => r.json())
            .then((j) => {
              if (j?.user) {
                setProfile({
                  name: j.user.name ?? null,
                  email: j.user.email,
                  city: j.user.city ?? null,
                  message: j.user.message ?? null,
                  referral_id: j.user.referral_id,
                });
                setStep("profile");
              }
            })
            .catch(() => {});
        }
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
        const em = sess?.user?.email ?? null;
        setSessionEmail(em);
        if (em) {
          fetch("/api/users/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }) })
            .then((r) => r.json())
            .then((j) => {
              if (j?.user) {
                setProfile({
                  name: j.user.name ?? null,
                  email: j.user.email,
                  city: j.user.city ?? null,
                  message: j.user.message ?? null,
                  referral_id: j.user.referral_id,
                });
                setStep("profile");
              }
            })
            .catch(() => {});
        }
      });
      return () => {
        sub?.subscription.unsubscribe();
      };
    } catch {
      // no-op
    }
  }, [open]);

  function randomToken(len = 8) {
    return Math.random().toString(36).slice(2, 2 + len);
  }

  async function sendOtp() {
    setLoading(true);
    setAlert(null);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
      setStep(step === "login_email" ? "login_code" : "signup_code");
      setAlert("We emailed you a 6-digit code. Enter it below.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setAlert(msg);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setAlert(null);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;
      if (!data?.user) {
        setAlert("Invalid code. Please try again.");
        return;
      }

      const verifiedEmail = data.user.email ?? email;

      if (step === "signup_code") {
        // Create or update profile with captured fields
        const name = `${firstName} ${lastName}`.trim();
        const body = {
          name,
          email: verifiedEmail,
          country_code: country,
          message: userMessage,
          photo_url: null as unknown as string | null,
          referral_id: randomToken(8),
          referred_by: null as unknown as string | null,
        };
        try {
          const res = await fetch("/api/users/upsert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const json = await res.json();
          if (json?.user) {
            setProfile({
              name: json.user.name ?? name,
              email: json.user.email,
              city: json.user.city ?? null,
              message: json.user.message ?? userMessage,
              referral_id: json.user.referral_id,
            });
            setStep("profile");
            setAlert(null);
            return;
          }
        } catch (e) {
          // fall through to close
        }
      }

      // For login path, fetch profile if exists
      try {
        const res = await fetch("/api/users/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: verifiedEmail }) });
        const json = await res.json();
        if (json?.user) {
          setProfile({
            name: json.user.name ?? null,
            email: json.user.email,
            city: json.user.city ?? null,
            message: json.user.message ?? null,
            referral_id: json.user.referral_id,
          });
          setStep("profile");
          setAlert(null);
          return;
        }
      } catch {}

      // default: close
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setAlert(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      id="dashboard-sheet"
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard"
      onWheel={(e) => {
        if (window.innerWidth < 1024) onClose();
      }}
      onTouchMove={(e) => {
        if (window.innerWidth < 1024) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      {/* Container: left column on desktop, full-screen on mobile */}
      <div className="absolute inset-0 flex items-start justify-start">
        <div
          className="relative w-full h-full lg:w-[360px] lg:h-screen rounded-none lg:rounded-none shadow-lg"
          style={{ background: "var(--parchment)" }}
        >
          {/* Close button (top-left), small italics 'x' in Seasons font and amber color */}
          <button
            aria-label="Close"
            onClick={onClose}
            className="absolute top-2 left-2 font-seasons italic text-sm"
            style={{ color: "var(--amber)" }}
          >
            x
          </button>

          {/* Content area: maintain 4:5 on desktop only; mobile uses full-screen panel */}
          <div className={step === "home" ? "lg:aspect-[4/5]" : ""}>
            <div className="grid grid-cols-4 grid-rows-5 gap-2 p-4 h-full">
              {step === "home" && (
                <div className="col-span-4 row-span-5 flex flex-col justify-center gap-3">
                  <div className="text-center">
                    <div className="font-seasons text-xl">Dream River</div>
                    <div className="text-sm text-muted-foreground">Sign in or join without leaving the page</div>
                  </div>
                  <div className="divider-amber" />
                  <button className="w-full rounded-md px-4 py-3 btn" onClick={() => setStep("signup_email")}>Join The Experiment</button>
                  <button className="w-full rounded-md px-4 py-3 btn font-sans" onClick={() => setStep("login_email")}>Resume your River</button>
                </div>
              )}

              {step === "profile" && profile && (
                <>
                  <div className="col-span-2 row-span-2 flex items-center justify-center">
                    <div className="rounded-full size-28 border shadow" style={{ borderColor: "var(--mist)", boxShadow: "0 3px 8px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.35)" }}>
                      <div className="rounded-full size-28" style={{ background: "#cfe4ff" }} />
                    </div>
                  </div>
                  <div className="col-start-3 col-end-5 row-start-1 flex items-end">
                    <div className="font-seasons text-xl leading-none truncate" title={profile.name ?? profile.email}>{profile.name ?? profile.email}</div>
                  </div>
                  <div className="col-span-4 row-start-3"><div className="divider-amber" /></div>
                  <div className="col-span-4 row-start-3 flex items-end pb-2">
                    <button className="w-full rounded-md px-4 py-3 btn">Share your link</button>
                  </div>
                  <div className="col-span-4 row-start-4">
                    <button className="w-full rounded-md px-4 py-3 btn font-seasons">Sail Through Your River</button>
                  </div>
                  <div className="col-span-4 row-start-5 grid grid-cols-4 gap-2">
                    {["Spotify","Apple","YouTube","Bandcamp"].map((label) => (
                      <button key={label} className="rounded-md px-2 py-2 text-xs" style={{ background: "#cfe4ff" }}>{label}</button>
                    ))}
                  </div>
                </>
              )}

              {step === "signup_email" && (
                <div className="col-span-4 row-span-5 space-y-3">
                  <h2 className="font-seasons text-xl">Join The Experiment</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input className="border rounded-md px-3 py-2 bg-background" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                    <input className="border rounded-md px-3 py-2 bg-background" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                  </div>
                  <input className="border rounded-md px-3 py-2 bg-background" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select className="border rounded-md px-3 py-2 bg-background" value={country} onChange={(e) => setCountry(e.target.value)} required>
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
                  </div>
                  <input className="border rounded-md px-3 py-2 bg-background" type="file" accept="image/*" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhoto(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                  <textarea className="border rounded-md px-3 py-2 bg-background" rows={3} placeholder="Message (optional)" value={userMessage} onChange={(e) => setUserMessage(e.target.value)} />
                  <button className="w-full rounded-md px-4 py-3 btn" disabled={loading || !firstName || !lastName || !email || !country} onClick={sendOtp}>{loading ? "Sending..." : "Send Code"}</button>
                  {alert && <p className="text-sm">{alert}</p>}
                  <button className="text-sm underline" onClick={() => setStep("home")}>Back</button>
                </div>
              )}

              {step === "signup_code" && (
                <div className="col-span-4 row-span-5 space-y-3">
                  <h2 className="font-seasons text-xl">Enter Code</h2>
                  <input className="border rounded-md px-3 py-2 bg-background tracking-widest text-center" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                  <button className="w-full rounded-md px-4 py-3 btn" disabled={loading || code.length !== 6} onClick={verifyOtp}>{loading ? "Verifying..." : "Verify"}</button>
                  {alert && <p className="text-sm">{alert}</p>}
                  <button className="text-sm underline" onClick={() => setStep("signup_email")}>Back</button>
                </div>
              )}

              {step === "login_email" && (
                <div className="col-span-4 row-span-5 space-y-3">
                  <h2 className="font-seasons text-xl">Resume your River</h2>
                  <input className="border rounded-md px-3 py-2 bg-background" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button
                    className="w-full rounded-md px-4 py-3 btn"
                    disabled={loading || !email}
                    onClick={async () => {
                      setLoading(true);
                      setAlert(null);
                      try {
                        // Check existing river
                        const res = await fetch("/api/users/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
                        const json = await res.json();
                        if (!json.exists) {
                          setAlert("No rivers found with that email address.");
                          setStep("signup_email");
                          return;
                        }
                        await sendOtp();
                      } catch (e) {
                        setAlert("Unable to check river. Try again.");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    {loading ? "Sending..." : "Send Code"}
                  </button>
                  {alert && <p className="text-sm">{alert}</p>}
                  <button className="text-sm underline" onClick={() => setStep("home")}>Back</button>
                </div>
              )}

              {step === "login_code" && (
                <div className="col-span-4 row-span-5 space-y-3">
                  <h2 className="font-seasons text-xl">Enter Code</h2>
                  <input className="border rounded-md px-3 py-2 bg-background tracking-widest text-center" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                  <button className="w-full rounded-md px-4 py-3 btn" disabled={loading || code.length !== 6} onClick={verifyOtp}>{loading ? "Verifying..." : "Verify"}</button>
                  {alert && <p className="text-sm">{alert}</p>}
                  <button className="text-sm underline" onClick={() => setStep("login_email")}>Back</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


