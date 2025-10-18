"use client";

/*
  Dashboard badge layout (4:5 ratio). Grid of 4 (x) by 5 (y).
  - x1+x2 & y1+y2: circular image badge with light teal border + shadow
  - x3 y1: first name in Adobe Seasons
  - x3 y2: number (connections) in bold Helvetica
  - x4 y2: paper boat icon placeholder
  - y3: Share button (full width)
  - y4: Sail Through Your River button (full width, Seasons font)
  - y5: 4 service buttons (Spotify, Apple, YouTube, Bandcamp) tinted light blue
*/

import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import ShareTiles from "@/components/ShareTiles";
import { useMe } from "@/hooks/useMe";

export default function DashboardBadge() {
  const [mode, setMode] = useState<"default" | "share">("default");
  const { me } = useMe();
  const [announce, setAnnounce] = useState<string>("");
  const defaultShareMessage = "Hey! I found this band called The Sonic Alchemists led by Eshaan Sood, a guitarist from India. They just put out an album and made a game for it. I’ve been listening to Dream River by them lately and I think you’ll enjoy it too.";
  const prefersReduced = useReducedMotion();
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  const overlayHeaderRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (mode === 'share') {
      setTimeout(() => overlayHeaderRef.current?.focus(), 0);
    }
  }, [mode]);

  // Data bindings removed for overhaul. UI uses placeholders until rebuilt.
  return (
    <section
      id="dashboard-overlay"
      data-mode={mode}
      className="relative mx-auto w-full max-w-md aspect-[4/5] rounded-xl p-4"
      style={{ background: "var(--parchment)" }}
      aria-label="Profile badge"
    >
      <div className="grid grid-cols-4 grid-rows-5 gap-2 h-full">
        {/* Circular badge covering x1+x2 & y1+y2 */}
        <div className="col-span-2 row-span-2 flex items-center justify-center">
          <div
            className="rounded-full size-28 border shadow"
            style={{ borderColor: "var(--mist)", boxShadow: "0 3px 8px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.35)" }}
          >
            <div className="rounded-full size-28" style={{ background: "#cfe4ff" }} />
          </div>
        </div>

        {/* x3 y1: first name (Seasons) */}
        <div className="col-start-3 col-end-4 row-start-1 flex items-end">
          <div className="font-seasons text-2xl leading-none truncate">{me?.name ? String(me.name).split(' ')[0] : '—'}</div>
        </div>

        {/* x3 y2: connections number */}
        <div className="col-start-3 col-end-4 row-start-2 flex items-start">
          <div className="font-sans font-bold text-xl">{me?.boats_total ?? 0}</div>
        </div>

        {/* x4 y2: paper boat icon placeholder */}
        <div className="col-start-4 col-end-5 row-start-2 flex items-start">
          <div className="size-6 rounded-sm" style={{ background: "var(--aqua)" }} aria-label="Paper boat" />
        </div>

        {/* Divider under main profile section */}
        <div className="col-span-4 row-start-3">
          <div className="divider-amber" />
        </div>

        {/* y3: Share button */}
        <div className="col-span-4 row-start-3 flex items-end pb-2">
          <motion.button
            className="w-full rounded-md px-4 py-3 btn"
            aria-controls="dashboard-overlay"
            onClick={() => setMode("share")}
            disabled={!me?.referral_url}
            initial={false}
            animate={mode === "share" && !prefersReduced ? { y: -24, scale: 0.92, opacity: 0 } : { y: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            ref={shareButtonRef}
          >
            Share your Boat
          </motion.button>
        </div>

        {/* y4: Sail Through Your River (Seasons font) */}
        <div className="col-span-4 row-start-4">
          <button className="w-full rounded-md px-4 py-3 font-seasons btn">Sail Through Your River</button>
        </div>

        {/* y5: 4 service buttons tinted light blue */}
        <div className="col-span-4 row-start-5 grid grid-cols-4 gap-2">
          {[
            { label: "Spotify" },
            { label: "Apple" },
            { label: "YouTube" },
            { label: "Bandcamp" },
          ].map((b) => (
            <button key={b.label} className="rounded-md px-2 py-2 text-xs" style={{ background: "#cfe4ff" }}>{b.label}</button>
          ))}
        </div>
      </div>

      {mode === "share" && (
        <div
          className="absolute inset-0 rounded-xl p-4"
          style={{ background: 'var(--parchment)', border: '1px solid var(--mist)', boxShadow: '0 6px 20px rgba(0,0,0,.10)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); setMode('default'); setTimeout(() => shareButtonRef.current?.focus(), 0); }
            if (e.key !== 'Tab') return;
            const root = e.currentTarget as HTMLElement;
            const focusable = root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey) {
              if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else {
              if (document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
          }}
          onClick={() => { setMode('default'); setTimeout(() => shareButtonRef.current?.focus(), 0); }}
        >
          <div className="flex items-center justify-between mb-3" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Back" className="underline" onClick={() => { setMode('default'); setTimeout(() => shareButtonRef.current?.focus(), 0); }} ref={overlayHeaderRef}>Back</button>
            <h3 id="share-title" className="font-seasons text-lg">Share your Boat</h3>
            <div aria-live="polite" className="sr-only">{announce}</div>
          </div>
          <div className="grid grid-cols-2 gap-3" id="share-tiles-wrap" onClick={(e) => e.stopPropagation()}>
            <ShareTiles referralUrl={me?.referral_url || ""} message={defaultShareMessage} userFullName={me?.name || ""} onCopy={(ok) => setAnnounce(ok ? 'Copied!' : '')} />
          </div>
          <style jsx>{`
            @media (prefers-reduced-motion: no-preference) {
              @keyframes fadeScaleIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
              .staggerIn { animation: fadeScaleIn 200ms ease-out both; }
            }
          `}</style>
        </div>
      )}
    </section>
  );
}


