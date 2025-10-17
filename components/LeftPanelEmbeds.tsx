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
        const paddingY = 0; // handled by outer container
        const remaining = Math.max(0, total - headerH - dividerH - paddingY);
        setBcHeight(remaining);
      } catch {}
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return (
    <div ref={wrapRef} className="h-full flex flex-col min-h-0">
      <div ref={headerRef}>
        <HowToPlayVideo />
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.25)' }} />
      <div className="flex-1 min-h-0 relative">
        <BandcampEmbed fill computedHeight={bcHeight} />
      </div>
    </div>
  );
}


