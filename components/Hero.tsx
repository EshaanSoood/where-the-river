export default function Hero() {
  return (
    <section id="hero" className="relative max-w-2xl mx-auto p-4 space-y-3 rounded-xl">
      {/* Frosted overlay only on desktop to avoid double-stacking with parent card */}
      <div className="hidden lg:block absolute inset-0 rounded-xl backdrop-blur" style={{ background: "var(--aqua)", opacity: 0.3, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }} aria-hidden="true" />
      <div className="relative">
        <h1 className="text-2xl font-seasons">Where The River Flows</h1>
        <p className="italic text-sm text-muted-foreground">A social experiment to see just how connected we really are.</p>
        <hr className="divider-amber" />
        <p className="text-sm text-foreground">
          Thank you for making your way to this little mini-game. Recently, I came across the idea of <em>six degrees of separation</em> — the notion that everyone on Earth is linked through just six steps of connection. I wanted to test this theory in the real world, through music.
        </p>
      </div>
    </section>
  );
}

