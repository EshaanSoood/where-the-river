import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type UserMeta = {
  name?: string | null;
  email?: string | null;
  country_code?: string | null;
  referred_by?: string | null;
  referral_id?: string | null;
  created_at?: string | null;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";
    const since = filter === "all" ? null : new Date(Date.now() - (filter === "30d" ? 30 : 7) * 24 * 3600 * 1000);

    type AuthUsersRow = { raw_user_meta_data: UserMeta | null };
    const { data, error } = await supabaseServer
      .from('auth.users')
      .select('raw_user_meta_data')
      .limit(20000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const metas: UserMeta[] = (data || []).map((r) => ((r as unknown as AuthUsersRow).raw_user_meta_data || {}) as UserMeta);
    const rows = metas.map((m) => ({
      name: (m.name || null) as string | null,
      email: (m.email || null) as string | null,
      country_code: (m.country_code || null) as string | null,
      referred_by: (m.referred_by || null) as string | null,
      referral_id: (m.referral_id || null) as string | null,
      created_at: (m.created_at || null) as string | null,
    }));
    const referralToUser: Record<string, UserMeta> = {};
    rows.forEach(r => { if (r.referral_id) referralToUser[r.referral_id] = r; });

    const nodes = rows.map(r => ({
      id: r.referral_id || (r.email || ''),
      name: (r.name || r.email || "Anonymous").trim(),
      countryCode: String(r.country_code || "").toUpperCase(),
      createdAt: r.created_at || new Date().toISOString(),
    }));

    const links = rows
      .filter(r => r.referred_by && referralToUser[r.referred_by])
      .map(r => ({ source: r.referred_by as string, target: (r.referral_id || (r.email || '')) as string }));

    return NextResponse.json({ nodes, links });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}



