"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";

type UseUserResult = {
  user: { email?: string | null } | null;
  loading: boolean;
};

export function useUser(): UseUserResult {
  const [user, setUser] = useState<{ email?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    try {
      const supabase = getSupabase();
      supabase.auth.getSession().then(({ data }) => {
        if (!isMounted) return;
        setUser(data.session?.user ?? null);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
        if (!isMounted) return;
        setUser(session?.user ?? null);
        setLoading(false);
      });
      return () => {
        isMounted = false;
        sub?.subscription.unsubscribe();
      };
    } catch {
      setLoading(false);
      return () => {};
    }
  }, []);

  return { user, loading };
}


