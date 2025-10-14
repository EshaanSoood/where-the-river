"use client";

import React, { useEffect, useRef, useState } from "react";
import { fetchGlobeData } from "@/lib/globeData";

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function GlobeSummarySR() {
  const [text, setText] = useState("Loading globe summary.");
  const prevRef = useRef<{ people: number; countries: number; connections: number; from: string; to: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

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
        if (!prev || prev.people !== people || prev.countries !== countries || prev.connections !== connections || prev.from !== from || prev.to !== to) {
          prevRef.current = snapshot;
          setText(`${people} people are sailing through Dream River in ${countries} countries. ${connections} connections have been made, and the longest river runs from ${from} to ${to}. Updated ${formatTime(now)}.`);
        }
      } catch {}
    };

    // initial and every 10 minutes
    compute();
    timer = window.setInterval(compute, 10 * 60 * 1000);
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, []);

  return (
    <div className="sr-only">
      <p aria-live="polite" aria-atomic="true">{text}</p>
    </div>
  );
}


