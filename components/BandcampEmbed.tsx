export default function BandcampEmbed() {
  // Use CSS vars from globals: --parchment for bg, --aqua for links
  const bg = 'f7f0e4'; // matches var(--parchment)
  const link = '2AA7B5'.toLowerCase(); // matches var(--aqua)
  return (
    <iframe
      title="Bandcamp player"
      style={{ border: 0, width: "100%", height: 42 }}
      src={`https://bandcamp.com/EmbeddedPlayer/album=672398703/size=small/bgcol=${bg}/linkcol=${link}/transparent=true/`}
      seamless
      loading="lazy"
    >
      <a href="https://eshaansood.bandcamp.com/album/the-sonic-alchemists-i-dream-river">
        The Sonic Alchemists I: Dream River by Eshaan Sood
      </a>
    </iframe>
  );
}


