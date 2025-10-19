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
        // Longest river: compute endpoints using directed links graph
        const idToIndex = new Map<string, number>();
        nodes.forEach((n, i) => idToIndex.set(n.id, i));
        const adjacency = new Map<string, string[]>();
        const inDegree = new Map<string, number>();
        for (const n of nodes) {
          adjacency.set(n.id, []);
          inDegree.set(n.id, 0);
        }
        for (const e of links) {
          const src = e.source;
          const dst = e.target;
          if (!adjacency.has(src) || !inDegree.has(dst)) continue;
          adjacency.get(src)!.push(dst);
          inDegree.set(dst, (inDegree.get(dst) || 0) + 1);
        }
        // DFS with memoization to find longest path from a node
        const memo = new Map<string, { length: number; endId: string }>();
        const visiting = new Set<string>();
        const dfs = (nodeId: string): { length: number; endId: string } => {
          const cached = memo.get(nodeId);
          if (cached) return cached;
          if (visiting.has(nodeId)) return { length: 0, endId: nodeId }; // break cycles defensively
          visiting.add(nodeId);
          const neighbors = adjacency.get(nodeId) || [];
          let best = { length: 0, endId: nodeId };
          for (const nb of neighbors) {
            const res = dfs(nb);
            if (res.length + 1 > best.length) {
              best = { length: res.length + 1, endId: res.endId };
            }
          }
          visiting.delete(nodeId);
          memo.set(nodeId, best);
          return best;
        };
        // Consider all roots (inDegree == 0). If none, consider all nodes.
        const roots: string[] = [];
        inDegree.forEach((deg, id) => { if (deg === 0) roots.push(id); });
        const startCandidates = roots.length > 0 ? roots : nodes.map(n => n.id);
        let globalBest = { startId: nodes[0]?.id || "", endId: nodes[0]?.id || "", length: -1 };
        for (const startId of startCandidates) {
          const res = dfs(startId);
          if (res.length > globalBest.length) {
            globalBest = { startId, endId: res.endId, length: res.length };
          } else if (res.length === globalBest.length && res.length >= 0) {
            // Tie-breaker: prefer older start by createdAt if available
            const aIdx = idToIndex.get(startId) || 0;
            const bIdx = idToIndex.get(globalBest.startId) || 0;
            const aDate = nodes[aIdx]?.createdAt?.getTime?.() || 0;
            const bDate = nodes[bIdx]?.createdAt?.getTime?.() || 0;
            if (aDate < bDate) {
              globalBest = { startId, endId: res.endId, length: res.length };
            }
          }
        }
        const fromNode = nodes[idToIndex.get(globalBest.startId) ?? 0];
        const toNode = nodes[idToIndex.get(globalBest.endId) ?? (nodes.length - 1)];
        const from = fromNode?.name || "origin";
        const to = toNode?.name || "destination";
        const now = new Date();
        const snapshot = { people, countries, connections, from, to };
        const prev = prevRef.current;
        // Avoid announcing a misleading "0 people" snapshot; retry instead
        if (people === 0) {
          if (retriesRef.current < 3) {
            retriesRef.current += 1;
            if (!retryTimer) retryTimer = window.setTimeout(compute, retriesRef.current * 1500);
            return;
          }
          // Fallback message if still empty after retries
          setText("No participants yet. The river will update here when people join.");
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


