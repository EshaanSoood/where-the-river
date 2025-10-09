"use client";

import PlausibleProvider from "next-plausible";
import { PropsWithChildren } from "react";

export default function Providers({ children }: PropsWithChildren) {
  const domain = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.PLAUSIBLE_DOMAIN;
  return (
    <PlausibleProvider domain={domain || "localhost"} trackOutboundLinks>
      {children}
    </PlausibleProvider>
  );
}


