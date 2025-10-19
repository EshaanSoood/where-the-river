type Props = { height?: number; fill?: boolean; computedHeight?: number };

export default function BandcampEmbed({ height = 120, fill = false, computedHeight }: Props) {
  // Brand colors from globals: --parchment (bg), --aqua (link)
  const bg = "f7f0e4"; // var(--parchment)
  const link = "2aa7b5"; // var(--aqua)
  return (
    <div className={fill ? "p-0 h-full min-h-0" : "p-0"}>
      {/* Desktop: large branded player for ≥1024px */}
      <div className={fill ? "hidden md:flex flex-col h-full min-h-0 overflow-hidden" : "hidden md:block overflow-hidden"}>
        <iframe
          title="Bandcamp player (large)"
          style={{ width: '100%', height: fill ? (computedHeight ?? '100%') : (height || 200), display: 'block', borderRadius: 16, background: 'rgba(210, 245, 250, 0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
          src={`https://bandcamp.com/EmbeddedPlayer/album=672398703/size=large/bgcol=${bg}/linkcol=${link}/transparent=true/`}
          seamless
          loading="lazy"
        >
          <a href="https://eshaansood.bandcamp.com/album/the-sonic-alchemists-i-dream-river">
            The Sonic Alchemists I: Dream River by Eshaan Sood
          </a>
        </iframe>
      </div>
      {/* Mobile/Tablet: compact sizing */}
      <div className="block md:hidden overflow-hidden">
        <iframe
          title="Bandcamp player (mobile compact)"
          style={{ width: "100%", height: 100, display: 'block', borderRadius: 16, background: 'rgba(210, 245, 250, 0.35)', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
          src={`https://bandcamp.com/EmbeddedPlayer/album=672398703/size=small/bgcol=${bg}/linkcol=${link}/transparent=true/`}
          seamless
          loading="lazy"
        >
          <a href="https://eshaansood.bandcamp.com/album/the-sonic-alchemists-i-dream-river">
            The Sonic Alchemists I: Dream River by Eshaan Sood
          </a>
        </iframe>
      </div>
    </div>
  );
}


