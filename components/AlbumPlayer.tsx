export default function AlbumPlayer() {
  return (
    <section className="max-w-2xl mx-auto p-6 space-y-3">
      <div className="rounded-lg border p-4 bg-background/70 backdrop-blur">
        <div className="font-medium mb-2">Album Player (placeholder)</div>
        <div className="text-sm text-muted-foreground">30s preview here (stretch goal).</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="px-3 py-2 rounded-md border text-sm" href="#spotify">Spotify</a>
        <a className="px-3 py-2 rounded-md border text-sm" href="#apple">Apple Music</a>
        <a className="px-3 py-2 rounded-md border text-sm" href="#bandcamp">Bandcamp</a>
        <a className="px-3 py-2 rounded-md border text-sm" href="#youtube">YouTube Music</a>
      </div>
    </section>
  );
}

