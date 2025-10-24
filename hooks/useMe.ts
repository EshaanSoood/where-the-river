"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";
import { useUser } from "@/hooks/useUser";

export type MeData = {
  email: string;
  name: string | null;
  country_code: string | null;
  country_name: string | null;
  message: string | null;
  boat_color: string | null;
  boats_total: number;
  referral_id: string | null;
  ref_code_8: string | null;
  referral_code: string | null;
  referral_url: string | null;
};

type UseMeResult = {
  me: MeData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useMe(emailOverride?: string | null): UseMeResult {
  const { user, loading: authLoading } = useUser();
  const email = (emailOverride ?? user?.email ?? null) || null;

  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = useMemo(() => {
    try {
      const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_APP_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "")) as string;
      return base.replace(/\/$/, "");
    } catch {
      return "";
    }
  }, []);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Session-based unified server read; body optional
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      try {
        const supabase = getSupabase();
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {}
      const resp = await fetch(`${baseUrl}/api/me`, { method: "POST", headers, body: JSON.stringify(email ? { email } : {}) });
      if (!resp.ok) throw new Error(`Failed to fetch me: ${resp.status}`);
      const json = await resp.json();
      const m = json?.me as Partial<MeData> | undefined;
      if (!m) throw new Error("Malformed response");
      const referral_url = (m.referral_url ?? null) as string | null;
      const boats_total = typeof m.boats_total === "number" ? m.boats_total : 0;
      setMe({
        email: String(m.email || email),
        name: (m.name ?? null) as string | null,
        country_code: (m.country_code ?? null) as string | null,
        country_name: (m.country_name ?? null) as string | null,
        message: (m.message ?? null) as string | null,
        boat_color: (m.boat_color ?? null) as string | null,
        boats_total,
        referral_id: (m.referral_id ?? null) as string | null,
        ref_code_8: (m.ref_code_8 ?? null) as string | null,
        referral_code: (m.referral_code ?? null) as string | null,
        referral_url,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [email, baseUrl]);

  useEffect(() => {
    if (authLoading) return;
    fetchMe().catch(() => {});
  }, [authLoading, fetchMe]);

  return { me, loading: authLoading || loading, error, refresh: fetchMe };
}




