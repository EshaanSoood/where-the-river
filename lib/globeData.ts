"use client";

import { getSupabase } from "@/lib/supabaseClient";
import { countryCodeToLatLng, jitterLatLng } from "@/app/data/countryCentroids";

export type UserRow = {
  id: string;
  name: string | null;
  country_code: string;
  referred_by: string | null;
  referral_id: string;
  created_at: string;
};

export type GlobeNode = {
  id: string;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  createdAt: Date;
};

export type GlobeLink = {
  source: string; // referral_id of parent
  target: string; // referral_id of child
};

export type TimeFilter = "all" | "30d" | "7d";

export async function fetchGlobeData(filter: TimeFilter = "all") {
  // Use server API to avoid client RLS/env issues; project URL inferred at runtime
  const base = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const url = `${base}/api/globe?filter=${encodeURIComponent(filter)}`;
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!resp.ok) throw new Error(`globe api failed: ${resp.status}`);
  const json = await resp.json();
  const nodesRaw = (json?.nodes || []) as Array<{ id: string; name: string; countryCode: string; createdAt: string }>;
  const linksRaw = (json?.links || []) as Array<{ source: string; target: string }>;
  const nodes: GlobeNode[] = nodesRaw.map(n => {
    const cc = (n.countryCode || '').toUpperCase();
    const base = countryCodeToLatLng[cc];
    const [lat, lng] = base ? jitterLatLng(base[0], base[1], 2.0) : [0, 0];
    return { id: n.id, name: n.name || 'Anonymous', countryCode: cc, lat, lng, createdAt: new Date(n.createdAt) };
  });
  const links: GlobeLink[] = linksRaw.map(l => ({ source: l.source, target: l.target }));
  return { nodes, links };
}

export function subscribeRealtime(onInsert: (u: UserRow) => void) {
  const supabase = getSupabase();
  const channel = supabase
    .channel("users-realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "users" },
      (payload: { new: UserRow }) => {
        onInsert(payload.new);
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}


