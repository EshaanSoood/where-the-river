"use client";

import { useEffect, useRef, useState } from "react";
import BandcampEmbed from "@/components/BandcampEmbed";
import HowToPlayVideo from "@/components/HowToPlayVideo";

export default function LeftPanelEmbeds() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [bandcampHeight, setBandcampHeight] = useState<number>(120);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const h = el.clientHeight;
      // Reserve space: heading (~28), divider (1.5), padding (p-4 top+bottom ~32), youtube aspect (~56% of width)
      // We will size Bandcamp to a clamped remaining height, minimum 80, maximum 180.
      const w = el.clientWidth;
      const youtubeH = Math.round(w * 9 / 16);
      const reserved = 28 + 2 + 32 + youtubeH;
      const remaining = Math.max(80, Math.min(180, h - reserved));
      setBandcampHeight(remaining);
    };
    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full flex flex-col min-h-0">
      <div className="p-4">
        <BandcampEmbed height={bandcampHeight} />
      </div>
      <div style={{ height: 1.5, background: 'rgba(11,13,26,0.35)', boxShadow: '0 0 2px rgba(11,13,26,0.25)' }} />
      <HowToPlayVideo />
    </div>
  );
}


