type Props = { height?: number };

export default function BandcampEmbed({ height = 120 }: Props) {
  // Brand colors from globals: --parchment (bg), --aqua (link)
  const bg = "f7f0e4"; // var(--parchment)
  const link = "2aa7b5"; // var(--aqua)
  return (
    <div className="p-2">
      {/* Desktop: compact player to ensure full visibility without cropping */}
      <div className="hidden md:block">
        <iframe
          title="Bandcamp player (compact)"
          style={{ border: 0, width: '100%', height }}
          src={`https://bandcamp.com/EmbeddedPlayer/album=672398703/size=small/bgcol=${bg}/linkcol=${link}/transparent=true/`}
          seamless
          loading="lazy"
        >
          <a href="https://eshaansood.bandcamp.com/album/the-sonic-alchemists-i-dream-river">
            The Sonic Alchemists I: Dream River by Eshaan Sood
          </a>
        </iframe>
      </div>
      {/* Mobile/Tablet: same compact sizing */}
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


