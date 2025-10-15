"use client";

import React, { useEffect, useRef, useState } from "react";
import { fetchGlobeData } from "@/lib/globeData";

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function GlobeSummarySR({ id }: { id?: string }) {
  const [text, setText] = useState("Loading globe summary.");
  const prevRef = useRef<{ people: number; countries: number; connections: number; from: string; to: string } | null>(null);
  const retriesRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let retryTimer: number | null = null;

    const compute = async () => {
      try {
        const { nodes, links } = await fetchGlobeData("all");
        if (cancelled) return;
        const people = nodes.length;
        const countries = new Set(nodes.map(n => n.countryCode)).size;
        const connections = links.length;
        // Longest river heuristic: pick first and last nodes by createdAt if available
        const from = nodes[0]?.name || "origin";
        const to = nodes[nodes.length - 1]?.name || "destination";
        const now = new Date();
        const snapshot = { people, countries, connections, from, to };
        const prev = prevRef.current;
        // Avoid announcing a misleading "0 people" snapshot; retry instead
        if (people === 0) {
          if (retriesRef.current < 3) {
            retriesRef.current += 1;
            if (!retryTimer) retryTimer = window.setTimeout(compute, retriesRef.current * 1500);
          }
          return;
        }
        // Update only on change
        if (!prev || prev.people !== people || prev.countries !== countries || prev.connections !== connections || prev.from !== from || prev.to !== to) {
          prevRef.current = snapshot;
          setText(`${people} people are sailing through Dream River in ${countries} countries. ${connections} connections have been made, and the longest river runs from ${from} to ${to}. Updated ${formatTime(now)}.`);
        }
      } catch {}
    };

    // initial and every 10 minutes; also attempt refresh on visibility change
    compute();
    timer = window.setInterval(compute, 10 * 60 * 1000);
    const vis = () => { if (!document.hidden) compute(); };
    document.addEventListener('visibilitychange', vis, { passive: true });
    return () => { cancelled = true; if (timer) window.clearInterval(timer); if (retryTimer) window.clearTimeout(retryTimer); };
  }, []);

  return (
    <div className="sr-only" id={id}>
      <p aria-live="polite" aria-atomic="true">{text}</p>
    </div>
  );
}


