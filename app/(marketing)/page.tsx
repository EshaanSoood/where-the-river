"use client";

import BelowMap from "@/components/BelowMap";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ paddingInline: "clamp(16px, 4vw, 32px)" }}>
      <main className="flex-1 min-h-0" style={{ ['--hdr' as unknown as string]: '40px' }}>
        <BelowMap />
      </main>
      <footer aria-label="Site footer" className="mt-6 lg:sticky bottom-0 z-30">
        <div
          className="w-full rounded-[24px]"
          style={{
            height: 40,
            background: 'rgba(210, 245, 250, 0.32)',
            backdropFilter: 'blur(10px)',
            borderTop: '1px solid rgba(255,255,255,0.25)'
          }}
        >
          <div className="h-full flex items-center gap-2" style={{ paddingInline: '8px' }}>
            {/* Left-aligned button row */}
            <a href="https://www.instagram.com/thejumpymonkey" aria-label="Instagram" className="footer-btn" target="_blank" rel="noopener noreferrer">
              <img src="/logos/Instagram.svg" alt="Instagram" className="footer-icon" />
            </a>
            <a href="mailto:" aria-label="Email" className="footer-btn">
              <img src="/logos/Mail.svg" alt="Email" className="footer-icon" />
            </a>
            <a href="https://www.youtube.com/@eshaansoood" aria-label="YouTube" className="footer-btn" target="_blank" rel="noopener noreferrer">
              <span className="footer-mask youtube" aria-hidden="true" />
            </a>
            <a href="https://music.apple.com/us/album/the-sonic-alchemists-i-dream-river/1837469371" aria-label="Apple Music" className="footer-btn" target="_blank" rel="noopener noreferrer">
              <span className="footer-mask applemusic" aria-hidden="true" />
            </a>
            <a href="https://open.spotify.com/album/1Tjrceud212g5KUcZ37Y1U?si=V4_K_uW5T0y-zd7sw481rQ&nd=1&dlsi=5c3cba22ef9f467e" aria-label="Spotify" className="footer-btn" target="_blank" rel="noopener noreferrer">
              <span className="footer-mask spotify" aria-hidden="true" />
            </a>
          </div>
          <div className="h-px" style={{ background: '#0b0d1a', opacity: 0.6 }} />
        </div>
        <style jsx>{`
          .footer-btn {
            width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
            border-radius: 6px; background: rgba(11,13,26,0.75); box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.2);
          }
          .footer-icon { width: 18px; height: 18px; filter: opacity(0.8) drop-shadow(0 0 2px rgba(0,0,0,0.35)) hue-rotate(160deg) saturate(120%);
          }
          .footer-mask { display: inline-block; width: 18px; height: 18px; background-color: rgba(42,167,181,0.8); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-size: contain; mask-repeat: no-repeat; mask-position: center; filter: drop-shadow(0 0 2px rgba(0,0,0,0.35)); }
          .footer-mask.youtube { -webkit-mask-image: url('/Streaming/youtube.eps'); mask-image: url('/Streaming/youtube.eps'); }
          .footer-mask.applemusic { -webkit-mask-image: url('/Streaming/applemusic.eps'); mask-image: url('/Streaming/applemusic.eps'); }
          .footer-mask.spotify { -webkit-mask-image: url('/Streaming/spotify.eps'); mask-image: url('/Streaming/spotify.eps'); }
        `}</style>
      </footer>
    </div>
  );
}


