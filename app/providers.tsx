"use client";

import PlausibleProvider from "next-plausible";
import { PropsWithChildren } from "react";
import { useEffect } from "react";
import { ensureRefCapturedAndResolved } from "@/lib/referral";

export default function Providers({ children }: PropsWithChildren) {
  const domain = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.PLAUSIBLE_DOMAIN;
  useEffect(() => { ensureRefCapturedAndResolved().catch(() => {}); }, []);
  return (
    <PlausibleProvider domain={domain || "localhost"} trackOutboundLinks>
      {children}
    </PlausibleProvider>
  );
}


