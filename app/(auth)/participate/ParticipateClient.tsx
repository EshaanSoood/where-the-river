"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import { getIsoCountries, type IsoCountry } from "@/lib/countryList";

export default function ParticipateClient({ serverRefCode }: { serverRefCode?: string | null }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countryName, setCountryName] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [boatColor, setBoatColor] = useState<string>("/Users/eshaansood/Where-the-river/web/app/(auth)/participate/ParticipateClient.tsx");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [countries, setCountries] = useState<IsoCountry[]>([]);

  useEffect(() => {
    setCountries(getIsoCountries("en"));
  }, []);
  // On mount, ensure profile store revalidates after OTP callback
  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent('profile:revalidate')); } catch {}
  }, []);

  function sanitizeName(raw: string): string {
    const collapsed = raw.replace(/\s+/g, " ").trim();
    const lettersOrDigits = /[\p{L}\p{N}]/u.test(collapsed);
    if (!lettersOrDigits) return "";
    return collapsed.slice(0, 80);
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const name = sanitizeName(`${firstName} ${lastName}`);
    if (name.length < 2) {
      setLoading(false);
      setNameError("Please enter your full name (at least 2 characters).");
      const el = document.getElementById("firstName");
      if (el) (el as HTMLInputElement).focus();
      return;
    }
    setNameError(null);
    try {
      const supabase = getSupabase();
      // Keep existing redirect threading; harmless if unused
      const codeParam = serverRefCode && serverRefCode.trim().length > 0 ? `?ref=${encodeURIComponent(serverRefCode)}` : '';
      const redirectTo = (typeof window !== 'undefined') ? `${window.location.origin}/${codeParam}` : undefined;
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectTo } });
      if (error) throw error;
      setStep("code");
      setMessage("We emailed you a 6-digit code. Enter it below.");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong";
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) throw error;
      if (data?.user) {
        const name = sanitizeName(`${firstName} ${lastName}`);
        if (name.length < 2) {
          setMessage("Please enter your full name.");
          const el = document.getElementById("firstName");
          if (el) (el as HTMLInputElement).focus();
          setLoading(false);
          return;
        }

        const headers: Record<string,string> = { "Content-Type": "application/json" };

        const referralCode = (serverRefCode || '').trim().replace(/\D+/g, '') || null;

        const payload = {
          name,
          email,
          country_code: countryCode,
          message: userMessage || null,
          photo_url: null,
          referred_by: referralCode,
          boat_color: boatColor,
        };

        await fetch("/api/users/upsert", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        }).then((r) => { if (!r.ok) throw new Error("Profile creation failed"); });
        setStep("done");
        router.push("/dashboard");
      } else {
        setMessage("Invalid code. Please try again.");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong";
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div role="status" aria-live="polite" className="sr-only" aria-hidden="false"></div>
      {step === "email" && (
        <form onSubmit={handleSendOtp} className="w-full max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">Participate</h1>
          <p className="text-sm text-muted-foreground">Fill the form and we’ll email you a 6-digit code.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="firstName" className="text-sm font-medium">First Name<span aria-hidden> *</span></label>
              <input id="firstName" className="w-full border rounded-md px-3 py-2 bg-background" type="text" value={firstName} onChange={(e) => { setFirstName(e.target.value); setNameError(null); }} required />
            </div>
            <div className="space-y-1">
              <label htmlFor="lastName" className="text-sm font-medium">Last Name<span aria-hidden> *</span></label>
              <input id="lastName" className="w-full border rounded-md px-3 py-2 bg-background" type="text" value={lastName} onChange={(e) => { setLastName(e.target.value); setNameError(null); }} required />
            </div>
          </div>
          {nameError && <p className="text-sm text-red-600" role="alert">{nameError}</p>}

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">Email<span aria-hidden> *</span></label>
            <input id="email" className="w-full border rounded-md px-3 py-2 bg-background" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="country" className="text-sm font-medium">Country<span aria-hidden> *</span></label>
              <select id="country" className="w-full border rounded-md px-3 py-2 bg-background" value={countryCode} onChange={(e) => {
                const code = e.target.value;
                setCountryCode(code);
                const found = countries.find((c) => c.code === code);
                setCountryName(found?.name || code);
              }} required>
                <option value="" disabled>Select your country</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="boatColor" className="text-sm font-medium">Boat Color<span aria-hidden> *</span></label>
              <input id="boatColor" type="color" className="h-10 w-full border rounded-md bg-background p-1" value={boatColor} onChange={(e) => setBoatColor(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="message" className="text-sm font-medium">Message (optional)</label>
            <textarea id="message" className="w-full border rounded-md px-3 py-2 bg-background" rows={3} value={userMessage} onChange={(e) => setUserMessage(e.target.value)} placeholder="Say something to your river…" />
          </div>

          {/* Hidden referred_by field rendered from server */}
          <input type="hidden" name="referred_by" value={(serverRefCode || '').replace(/\D+/g, '')} readOnly />

          <button className="w-full rounded-md bg-foreground text-background px-4 py-2 disabled:opacity-50" type="submit" disabled={loading || sanitizeName(`${firstName} ${lastName}`).length < 2 || !email || !countryCode}>
            {loading ? "Sending..." : "Send Code"}
          </button>
          {message && <p className="text-sm">{message}</p>}
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleVerifyOtp} className="w-full max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">Enter Code</h1>
          <p className="text-sm text-muted-foreground">Check your email for a 6-digit code.</p>
          <input className="w-full border rounded-md px-3 py-2 bg-background tracking-widest text-center" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />

          {/* Hidden referred_by mirrors server value into the verify form */}
          <input type="hidden" name="referred_by" value={(serverRefCode || '').replace(/\D+/g, '')} readOnly />

          <button className="w-full rounded-md bg-foreground text-background px-4 py-2 disabled:opacity-50" type="submit" disabled={loading || code.length !== 6}>
            {loading ? "Verifying..." : "Verify"}
          </button>
          <button type="button" className="w-full rounded-md border px-4 py-2" onClick={() => setStep("email")}>
            Use a different email
          </button>
          {message && <p className="text-sm">{message}</p>}
        </form>
      )}
    </main>
  );
}


