"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function ParticipatePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [userMessage, setUserMessage] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
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
        // Upsert minimal profile with required country_code
        const name = `${firstName} ${lastName}`.trim();
        const referral_id = Math.random().toString(36).slice(2, 10);
        await fetch("/api/users/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            country_code: country,
            message: userMessage || null,
            photo_url: null,
            referral_id,
            referred_by: null,
          }),
        }).catch(() => {});
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
      {step === "email" && (
        <form onSubmit={handleSendOtp} className="w-full max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">Participate</h1>
          <p className="text-sm text-muted-foreground">Fill the form and we’ll email you a 6-digit code.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="firstName" className="text-sm font-medium">First Name<span aria-hidden> *</span></label>
              <input
                id="firstName"
                className="w-full border rounded-md px-3 py-2 bg-background"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="lastName" className="text-sm font-medium">Last Name<span aria-hidden> *</span></label>
              <input
                id="lastName"
                className="w-full border rounded-md px-3 py-2 bg-background"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">Email<span aria-hidden> *</span></label>
            <input
              id="email"
              className="w-full border rounded-md px-3 py-2 bg-background"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="country" className="text-sm font-medium">Country<span aria-hidden> *</span></label>
              <select
                id="country"
                className="w-full border rounded-md px-3 py-2 bg-background"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                required
              >
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
          </div>

          <div className="space-y-1">
            <label htmlFor="photo" className="text-sm font-medium">Profile picture (optional)</label>
            <input
              id="photo"
              className="w-full border rounded-md px-3 py-2 bg-background"
              type="file"
              accept="image/*"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                setPhoto(file);
              }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="message" className="text-sm font-medium">Message (optional)</label>
            <textarea
              id="message"
              className="w-full border rounded-md px-3 py-2 bg-background"
              rows={3}
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              placeholder="Say something to your river…"
            />
          </div>

          <button
            className="w-full rounded-md bg-foreground text-background px-4 py-2 disabled:opacity-50"
            type="submit"
            disabled={
              loading || !firstName || !lastName || !email || !country
            }
          >
            {loading ? "Sending..." : "Send Code"}
          </button>
          {message && <p className="text-sm">{message}</p>}
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleVerifyOtp} className="w-full max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">Enter Code</h1>
          <p className="text-sm text-muted-foreground">Check your email for a 6-digit code.</p>
          <input
            className="w-full border rounded-md px-3 py-2 bg-background tracking-widest text-center"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
          <button
            className="w-full rounded-md bg-foreground text-background px-4 py-2 disabled:opacity-50"
            type="submit"
            disabled={loading || code.length !== 6}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <button
            type="button"
            className="w-full rounded-md border px-4 py-2"
            onClick={() => setStep("email")}
          >
            Use a different email
          </button>
          {message && <p className="text-sm">{message}</p>}
        </form>
      )}
    </main>
  );
}


