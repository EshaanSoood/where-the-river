"use client";

import BandcampEmbed from "@/components/BandcampEmbed";
import HowToPlayVideo from "@/components/HowToPlayVideo";
import { useEffect, useRef, useState } from "react";

export default function LeftPanelEmbeds() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [bcHeight, setBcHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const compute = () => {
      try {
        const wrap = wrapRef.current;
        const header = headerRef.current;
        if (!wrap) return;
        const total = wrap.clientHeight;
        const headerH = header ? header.offsetHeight : 0;
        const dividerH = 1; // matches divider height
        const paddingY = 16; // inner container p-2 => 8px top + 8px bottom
        const remaining = Math.max(0, total - headerH - dividerH - paddingY);
        // Ensure Bandcamp has enough room for controls
        setBcHeight(Math.max(160, remaining));
      } catch {}
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return (
    <div ref={wrapRef} className="h-full flex flex-col min-h-0 overflow-hidden">
      <div ref={headerRef} className="flex-shrink-0 pb-3">
        <HowToPlayVideo />
      </div>
      <div className="flex-shrink-0" style={{ height: 1, background: 'rgba(255,255,255,0.25)' }} />
      <div className="flex-1 min-h-0 relative p-2 rounded-[16px] overflow-hidden" style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}>
        <div className="h-full overflow-hidden">
          <BandcampEmbed fill computedHeight={bcHeight} />
        </div>
      </div>
    </div>
  );
}


