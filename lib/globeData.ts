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
  const supabase = getSupabase();
  const since = filter === "all" ? null : new Date(Date.now() - (filter === "30d" ? 30 : 7) * 24 * 3600 * 1000);
  let query = supabase
    .from("users")
    .select("id,name,country_code,referred_by,referral_id,created_at")
    .order("created_at", { ascending: true });
  if (since) query = query.gte("created_at", since.toISOString());
  const { data, error } = await query;
  if (error) throw error;

  const nodes: GlobeNode[] = [];
  const links: GlobeLink[] = [];
  const referralToUser: Record<string, UserRow> = {};

  (data || []).forEach((u: unknown) => {
    const row = u as UserRow;
    referralToUser[row.referral_id] = row;
  });

  (data || []).forEach((u: unknown) => {
    const row = u as UserRow;
    const cc = (row.country_code || "").toUpperCase();
    const base = countryCodeToLatLng[cc];
    const [lat, lng] = base ? jitterLatLng(base[0], base[1], 2.0) : [0, 0];
    nodes.push({
      id: row.referral_id,
      name: row.name || "Anonymous",
      countryCode: cc,
      lat,
      lng,
      createdAt: new Date(row.created_at),
    });
    if (row.referred_by && referralToUser[row.referred_by]) {
      links.push({ source: row.referred_by, target: row.referral_id });
    }
  });

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


