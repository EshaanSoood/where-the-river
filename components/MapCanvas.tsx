"use client";

import { useEffect, useRef } from "react";

export default function MapCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    function draw() {
      if (!ctx || !canvas) return;
      const { width, height } = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(width) || canvas.height !== Math.floor(height)) {
        canvas.width = Math.floor(width);
        canvas.height = Math.floor(height);
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, "#e6f0ff");
      grad.addColorStop(1, "#ffffff");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-label="Interactive map of shared rivers. Swipe to pan, pinch to zoom."
      className="w-full h-full block"
      role="img"
    />
  );
}

