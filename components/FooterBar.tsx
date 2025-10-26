"use client";

export default function FooterBar() {
  return (
    <footer aria-label="Site footer" className="mt-6 lg:sticky bottom-0 z-30">
      <div
        className="w-full"
        style={{
          height: 40,
          background: 'rgba(210, 245, 250, 0.35)',
          backdropFilter: 'blur(12px)',
          borderTop: '1.5px solid rgba(255,255,255,0.25)',
          borderBottom: 'none',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderRadius: '24px 24px 0 0'
        }}
      >
        <div className="h-full flex items-center justify-start gap-2" style={{ paddingInline: '8px' }}>
          {/* Left-aligned button row */}
          <a href="https://www.instagram.com/thejumpymonkey" aria-label="Instagram" className="footer-btn" target="_blank" rel="noopener noreferrer">
            <span className="footer-mask instagram" aria-hidden="true" />
          </a>
          <a href="mailto:eshaan@eshaansood.in" aria-label="Email" className="footer-btn">
            <span className="footer-mask mail" aria-hidden="true" />
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
          border-radius: 6px; background: rgba(11,13,26,0.75);
        }
        .footer-icon { display: none; }
        .footer-mask { display: inline-block; width: 20px; height: 20px; background-color: var(--teal); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; mask-size: contain; mask-repeat: no-repeat; mask-position: center; }
        .footer-mask.youtube { -webkit-mask-image: url('/Streaming/youtube.svg.png'); mask-image: url('/Streaming/youtube.svg.png'); }
        .footer-mask.applemusic { -webkit-mask-image: url('/Streaming/applemusic.svg'); mask-image: url('/Streaming/applemusic.svg'); }
        .footer-mask.bandcamp { -webkit-mask-image: url('/Streaming/bandcamp.svg.png'); mask-image: url('/Streaming/bandcamp.svg.png'); }
        .footer-mask.spotify { -webkit-mask-image: url('/Streaming/spotify.svg'); mask-image: url('/Streaming/spotify.svg'); }
        .footer-mask.instagram { -webkit-mask-image: url('/logos/Instagram.svg'); mask-image: url('/logos/Instagram.svg'); }
        .footer-mask.mail { -webkit-mask-image: url('/logos/email.png'); mask-image: url('/logos/email.png'); }
      `}</style>
    </footer>
  );
}


