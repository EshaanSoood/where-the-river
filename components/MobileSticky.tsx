"use client";

import { useEffect } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";

type Props = {
  isLoggedIn?: boolean;
  onOpenDashboard?: () => void;
  isOpen?: boolean;
  controlsId?: string;
};

export default function MobileSticky({ isLoggedIn, onOpenDashboard, isOpen, controlsId }: Props) {
  const analytics = useAnalytics();
  useEffect(() => {
    analytics.trackStickyImpression();
  }, []);
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t bg-background/90 backdrop-blur p-4 space-y-2" aria-live="polite">
      <div className="font-semibold">Float your paper boat.</div>
      <div className="text-sm text-muted-foreground">Help Dream River travel through friends.</div>
      <div className="flex gap-2">
        {isLoggedIn ? (
          <a className="flex-1 px-4 py-2 rounded-md text-center btn" href="#share" onClick={() => analytics.trackShareClick()}>Share your link</a>
        ) : (
          <button
            className="flex-1 px-4 py-2 rounded-md text-center btn"
            onClick={() => {
              analytics.trackParticipateClick();
              onOpenDashboard?.();
            }}
            aria-label="Dashboard"
            aria-controls={controlsId}
            aria-expanded={isOpen ? true : false}
          >
            Participate / Log in
          </button>
        )}
        <a className="px-4 py-2 rounded-md border text-center" href="#hero" onClick={() => analytics.trackLearnMore()}>Learn more ↓</a>
      </div>
    </div>
  );
}

