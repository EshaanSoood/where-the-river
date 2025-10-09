"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { fetchGlobeData, subscribeRealtime, type GlobeNode, type GlobeLink, type TimeFilter } from "@/lib/globeData";

type Size = { width: number; height: number };

const BRAND = {
  bg: "#faf8f5",
  land: "#a295b5",
  grid: "#e8c3d6",
  node: "#654f84",
  link: "#e8c3d6",
  halo: "rgba(101,79,132,0.2)",
};

export default function Globe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 800, height: 480 });
  const [filter, setFilter] = useState<TimeFilter>("all");
  const nodesRef = useRef<GlobeNode[]>([]);
  const linksRef = useRef<GlobeLink[]>([]);
  const rotatingRef = useRef<[number, number, number]>([0, -15, 0]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ width: Math.max(320, cr.width), height: Math.max(320, Math.min(720, cr.width * 0.6)) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Data load + realtime
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      const { nodes, links } = await fetchGlobeData(filter);
      nodesRef.current = nodes;
      linksRef.current = links;
      draw();
      unsub = subscribeRealtime((u) => {
        // Minimal live-updates: refetch for simplicity at this scale
        fetchGlobeData(filter).then(({ nodes, links }) => {
          nodesRef.current = nodes;
          linksRef.current = links;
          draw();
        });
      });
    })();
    return () => {
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const projection = useMemo(() => d3.geoOrthographic(), []);
  const path = useMemo(() => d3.geoPath(projection), [projection]);
  const graticule = useMemo(() => d3.geoGraticule10(), []);

  // Basic world land from topojson (inline light sphere only if topo unavailable)
  // To keep this self-contained without external fetch, draw sphere + grid only.

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = size;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const scale = Math.min(width, height) * 0.45;
    projection.translate([width / 2, height / 2]).scale(scale).rotate(rotatingRef.current);

    // Background
    ctx.fillStyle = BRAND.bg;
    ctx.fillRect(0, 0, width, height);

    // Globe (sphere)
    ctx.beginPath();
    path.context(ctx)({ type: "Sphere" });
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = BRAND.grid;
    ctx.stroke();

    // Graticule
    ctx.beginPath();
    path(graticule);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = BRAND.grid;
    ctx.stroke();

    // Links (great-circle-like arcs)
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = BRAND.link;
    ctx.globalAlpha = 0.75;
    for (const link of linksRef.current) {
      const s = nodesRef.current.find((n) => n.id === link.source);
      const t = nodesRef.current.find((n) => n.id === link.target);
      if (!s || !t) continue;
      drawArc(ctx, s, t);
    }
    ctx.globalAlpha = 1;

    // Nodes
    for (const n of nodesRef.current) {
      const p = projection([n.lng, n.lat]);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
      ctx.fillStyle = BRAND.node;
      ctx.fill();
      // Halo
      ctx.beginPath();
      ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
      ctx.strokeStyle = BRAND.halo;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawArc(ctx: CanvasRenderingContext2D, a: GlobeNode, b: GlobeNode) {
    const interp = d3.geoInterpolate([a.lng, a.lat], [b.lng, b.lat]);
    const steps = 32;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [lng, lat] = interp(i / steps);
      const p = projection([lng, lat]);
      if (!p) continue;
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  }

  // Interaction: rotate via drag; allow page scroll on touch unless dragging
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false;
    let lastX = 0,
      lastY = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const rot = rotatingRef.current.slice() as [number, number, number];
      rot[0] += dx * 0.3;
      rot[1] -= dy * 0.3;
      rotatingRef.current = rot;
      draw();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    };
    canvas.addEventListener("pointerdown", onDown, { passive: true });
    canvas.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  // Redraw on size/rotation
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  return (
    <section className="w-full py-6 lg:py-10">
      <div className="mx-auto max-w-6xl px-4" ref={containerRef}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-purple-900">Dream River – Globe</h2>
          <div className="inline-flex items-center gap-2 text-sm">
            <button
              className={`px-2.5 py-1 rounded ${filter === "all" ? "bg-purple-200" : "bg-purple-100"}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`px-2.5 py-1 rounded ${filter === "30d" ? "bg-purple-200" : "bg-purple-100"}`}
              onClick={() => setFilter("30d")}
            >
              30d
            </button>
            <button
              className={`px-2.5 py-1 rounded ${filter === "7d" ? "bg-purple-200" : "bg-purple-100"}`}
              onClick={() => setFilter("7d")}
            >
              7d
            </button>
          </div>
        </div>
        <div className="relative w-full overflow-hidden rounded-md border border-purple-200">
          <canvas ref={canvasRef} className="block w-full h-auto touch-pan-y" />
        </div>
        <p className="mt-2 text-xs text-purple-700">Pan to rotate. Real-time updates from Supabase. Links show parent→child referrals; pins show recent participants.</p>
      </div>
    </section>
  );
}


