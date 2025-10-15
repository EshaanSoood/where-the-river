export default function BandcampEmbed() {
  // Brand colors from globals: --parchment (bg), --aqua (link)
  const bg = "f7f0e4"; // var(--parchment)
  const link = "2aa7b5"; // var(--aqua)
  return (
    <div>
      {/* Desktop: large player */}
      <div className="hidden md:flex justify-center">
        <iframe
          title="Bandcamp player (desktop)"
          style={{ border: 0, width: 350, height: 720 }}
          src={`https://bandcamp.com/EmbeddedPlayer/album=672398703/size=large/bgcol=${bg}/linkcol=${link}/transparent=true/`}
          seamless
          loading="lazy"
        >
          <a href="https://eshaansood.bandcamp.com/album/the-sonic-alchemists-i-dream-river">
            The Sonic Alchemists I: Dream River by Eshaan Sood
          </a>
        </iframe>
      </div>
      {/* Mobile/Tablet: dynamic small player */}
      <div className="block md:hidden">
        <iframe
          title="Bandcamp player (mobile)"
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


