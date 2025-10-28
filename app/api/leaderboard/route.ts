import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getDisplayNameByUserId } from "@/server/names/nameService";

export async function GET() {
  try {
    // Read boats totals from the unified users_referrals table and join with auth metadata
    type AdminUser = { id: string; email: string | null; user_metadata?: Record<string, unknown> | null; raw_user_meta_data?: Record<string, unknown> | null };
    type AuthMeta = { name?: string | null; country_code?: string | null; boat_color?: string | null; otp_verified?: boolean | null };

    const { data: list, error: listErr } = await supabaseServer.auth.admin.listUsers({ page: 1, perPage: 10000 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400 });
    const users = (list?.users || []) as AdminUser[];

    // Read boats totals from unified users_referrals table
    const { data: referrals, error: refErr } = await supabaseServer
      .from('users_referrals')
      .select('user_id,boats_total');
    if (refErr) return NextResponse.json({ error: refErr.message }, { status: 400 });

    const totalsById = new Map<string, number>();
    (referrals || []).forEach((r) => {
      const id = (r as { user_id: string }).user_id;
      const total = (r as { boats_total: number }).boats_total || 0;
      totalsById.set(id, total);
    });

    const entries = await Promise.all(users.map(async (u) => {
      const meta = ((u.user_metadata || u.raw_user_meta_data) || {}) as AuthMeta;
      const boats = totalsById.get(u.id) || 0;
      const nameRes = await getDisplayNameByUserId(u.id);
      const displayName = (nameRes.fullName || nameRes.firstName || '').trim();
      return {
        id: u.id,
        first_name: (nameRes.firstName || '').trim(),
        displayName,
        country_code: meta.country_code || null,
        boat_color: meta.boat_color || null,
        otp_verified: Boolean(meta.otp_verified),
        boats_total: boats,
      };
    }));

    const filtered = entries.filter((e) => e.otp_verified && !!e.boat_color);
    const totalBoats = filtered.reduce((acc, e) => acc + (e.boats_total || 0), 0);
    const top = filtered
      .slice()
      .sort((a, b) => (b.boats_total || 0) - (a.boats_total || 0))
      .slice(0, 5)
      .map((e) => ({ first_name: e.first_name, displayName: e.displayName, country_code: e.country_code, boats_total: e.boats_total || 0 }));

    return NextResponse.json({ totalBoats, top }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}


