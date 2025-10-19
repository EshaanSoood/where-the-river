import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    // Aggregate from Auth Admin user metadata to avoid direct table read
    type AuthMeta = {
      name?: string | null;
      country_code?: string | null;
      boat_color?: string | null;
      otp_verified?: boolean | null;
      boats_total?: number | null;
    };

    const { data: list, error: listErr } = await supabaseServer.auth.admin.listUsers({ page: 1, perPage: 10000 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400 });
    type AdminUser = { user_metadata?: Record<string, unknown> | null; raw_user_meta_data?: Record<string, unknown> | null };
    const users = (list?.users || []) as AdminUser[];
    const metas: AuthMeta[] = users.map((u) => ((u.user_metadata || u.raw_user_meta_data) || {}) as AuthMeta);

    const isCountable = (m: AuthMeta) => Boolean(m && m.otp_verified && m.boat_color);
    const getBoats = (m: AuthMeta) => (typeof m.boats_total === 'number' ? m.boats_total : 0);

    const filtered = metas.filter(isCountable);
    const totalBoats = filtered.reduce((acc, m) => acc + getBoats(m), 0);
    const top = filtered
      .slice()
      .sort((a, b) => getBoats(b) - getBoats(a))
      .slice(0, 5)
      .map((m) => ({
        first_name: String(m.name || '').split(' ')[0] || '',
        country_code: m.country_code || null,
        boats_total: getBoats(m),
      }));

    return NextResponse.json({ totalBoats, top });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


