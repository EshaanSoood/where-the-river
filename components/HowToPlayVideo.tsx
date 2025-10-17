"use client";

type Props = { onHeightChange?: (height: number) => void };

export default function HowToPlayVideo({ onHeightChange }: Props) {
  return (
    <div className="p-4">
      <h2 className="mb-3 font-seasons" style={{ fontSize: '1.3rem', color: 'rgba(245,250,255,0.85)', fontWeight: 600 }}>How To Play</h2>
      <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
        <iframe
          width="560"
          height="315"
          src="https://www.youtube.com/embed/AlvMCxaiIno?si=ZkyjiCvfv2IRvSZ0"
          title="YouTube video player"
          frameBorder={0}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 w-full h-full rounded-[16px]"
        ></iframe>
      </div>
    </div>
  );
}


