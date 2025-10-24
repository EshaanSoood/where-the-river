"use client";

import PlausibleProvider from "next-plausible";
import { PropsWithChildren } from "react";
import { useEffect } from "react";
import { ensureRefCapturedAndResolved } from "@/lib/referral";

export default function Providers({ children }: PropsWithChildren) {
  const domain = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.PLAUSIBLE_DOMAIN;
  useEffect(() => {
    // Client-side capture & resolve (best-effort) and server cookie backstop
    try {
      const u = new URL(window.location.href);
      const ref = u.searchParams.getAll("ref")[0] || null;
      if (ref) {
        fetch("/api/referral/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: ref }) }).catch(() => {});
      }
    } catch {}
    ensureRefCapturedAndResolved().catch(() => {});
  }, []);
  return (
    <PlausibleProvider domain={domain || "localhost"} trackOutboundLinks>
      {children}
    </PlausibleProvider>
  );
}


