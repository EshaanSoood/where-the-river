import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  country_code: string | null;
  referred_by: string | null;
  referral_id: string | null;
  created_at: string;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";
    const since = filter === "all" ? null : new Date(Date.now() - (filter === "30d" ? 30 : 7) * 24 * 3600 * 1000);

    let query = supabaseServer
      .from("users")
      .select("id,name,email,country_code,referred_by,referral_id,created_at")
      .order("created_at", { ascending: true });
    if (since) query = query.gte("created_at", since.toISOString());
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data || []) as UserRow[];
    const referralToUser: Record<string, UserRow> = {};
    rows.forEach(r => { if (r.referral_id) referralToUser[r.referral_id] = r; });

    const nodes = rows.map(r => ({
      id: r.referral_id || r.id,
      name: (r.name || r.email || "Anonymous").trim(),
      countryCode: String(r.country_code || "").toUpperCase(),
      createdAt: r.created_at,
    }));

    const links = rows
      .filter(r => r.referred_by && referralToUser[r.referred_by])
      .map(r => ({ source: r.referred_by as string, target: (r.referral_id || r.id) as string }));

    return NextResponse.json({ nodes, links });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


