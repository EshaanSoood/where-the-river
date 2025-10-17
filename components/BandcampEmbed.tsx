type Props = { height?: number; fill?: boolean };

export default function BandcampEmbed({ height = 120, fill = false }: Props) {
  // Brand colors from globals: --parchment (bg), --aqua (link)
  const bg = "f7f0e4"; // var(--parchment)
  const link = "2aa7b5"; // var(--aqua)
  return (
    <div className={fill ? "p-0 h-full min-h-0" : "p-0"}>
      {/* Desktop: large branded player for ≥1024px */}
      <div className={fill ? "hidden md:flex flex-col h-full min-h-0" : "hidden md:block"}>
        <iframe
          title="Bandcamp player (large)"
          style={{ border: 0, width: '100%', height: fill ? '100%' : (height || 200) }}
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
      <div className="block md:hidden">
        <iframe
          title="Bandcamp player (mobile compact)"
          style={{ border: 0, width: "100%", height: 100 }}
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


