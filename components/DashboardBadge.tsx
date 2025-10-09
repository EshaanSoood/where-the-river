"use client";

/*
  Dashboard badge layout (4:5 ratio). Grid of 4 (x) by 5 (y).
  - x1+x2 & y1+y2: circular image badge with light teal border + shadow
  - x3 y1: first name in Adobe Seasons
  - x3 y2: number (connections) in bold Helvetica
  - x4 y2: paper boat icon placeholder
  - y3: Share button (full width)
  - y4: Sail Through Your River button (full width, Seasons font)
  - y5: 4 service buttons (Spotify, Apple, YouTube, Bandcamp) tinted light blue
*/

export default function DashboardBadge() {
  return (
    <section
      className="relative mx-auto w-full max-w-md aspect-[4/5] rounded-xl p-4"
      style={{ background: "var(--parchment)" }}
      aria-label="Profile badge"
    >
      <div className="grid grid-cols-4 grid-rows-5 gap-2 h-full">
        {/* Circular badge covering x1+x2 & y1+y2 */}
        <div className="col-span-2 row-span-2 flex items-center justify-center">
          <div
            className="rounded-full size-28 border shadow"
            style={{ borderColor: "var(--mist)", boxShadow: "0 3px 8px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.35)" }}
          >
            <div className="rounded-full size-28" style={{ background: "#cfe4ff" }} />
          </div>
        </div>

        {/* x3 y1: first name (Seasons) */}
        <div className="col-start-3 col-end-4 row-start-1 flex items-end">
          <div className="font-seasons text-2xl leading-none truncate">FirstName</div>
        </div>

        {/* x3 y2: connections number */}
        <div className="col-start-3 col-end-4 row-start-2 flex items-start">
          <div className="font-sans font-bold text-xl">12</div>
        </div>

        {/* x4 y2: paper boat icon placeholder */}
        <div className="col-start-4 col-end-5 row-start-2 flex items-start">
          <div className="size-6 rounded-sm" style={{ background: "var(--aqua)" }} aria-label="Paper boat" />
        </div>

        {/* Divider under main profile section */}
        <div className="col-span-4 row-start-3">
          <div className="divider-amber" />
        </div>

        {/* y3: Share button */}
        <div className="col-span-4 row-start-3 flex items-end pb-2">
          <button className="w-full rounded-md px-4 py-3 btn">Share your Boat</button>
        </div>

        {/* y4: Sail Through Your River (Seasons font) */}
        <div className="col-span-4 row-start-4">
          <button className="w-full rounded-md px-4 py-3 font-seasons btn">Sail Through Your River</button>
        </div>

        {/* y5: 4 service buttons tinted light blue */}
        <div className="col-span-4 row-start-5 grid grid-cols-4 gap-2">
          {[
            { label: "Spotify" },
            { label: "Apple" },
            { label: "YouTube" },
            { label: "Bandcamp" },
          ].map((b) => (
            <button key={b.label} className="rounded-md px-2 py-2 text-xs" style={{ background: "#cfe4ff" }}>{b.label}</button>
          ))}
        </div>
      </div>
    </section>
  );
}


