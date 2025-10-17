"use client";

import BandcampEmbed from "@/components/BandcampEmbed";
import HowToPlayVideo from "@/components/HowToPlayVideo";

export default function LeftPanelEmbeds() {
  return (
    <div className="h-full flex flex-col min-h-0">
      <HowToPlayVideo />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.25)' }} />
      <div className="flex-1 min-h-0">
        <BandcampEmbed fill />
      </div>
    </div>
  );
}


