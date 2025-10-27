"use client";

let lastFiredAt = 0;
const DEBOUNCE_MS = 750;

/**
 * Canonical way to open the Participate overlay across the app.
 * Emits a window event that BelowMap.tsx listens for.
 */
export function openParticipateOverlay() {
  try {
    const now = Date.now();
    if (now - lastFiredAt < DEBOUNCE_MS) return;
    lastFiredAt = now;
    const ev = new CustomEvent("participate:open");
    window.dispatchEvent(ev);
    // Optional telemetry via existing analytics hook pattern (plausible)
    try {
      // Lazy import to avoid coupling
      import("@/hooks/useAnalytics").then((m) => {
        try {
          // useAnalytics is a hook; avoid calling outside React. Instead, fire Plausible directly if available.
          // If next-plausible exposes a global, use it; else, no-op.
          (window as unknown as { plausible?: (e: string) => void }).plausible?.("participate_opened");
        } catch {}
      }).catch(() => {});
    } catch {}
  } catch {}
}

export default openParticipateOverlay;


