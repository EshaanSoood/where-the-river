import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCountryNameFromCode } from "@/lib/countryMap";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body || {};
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    // Source of truth: auth.users metadata
    type AuthUserRow = { id: string; email: string; raw_user_meta_data: AuthMeta | null };
    const { data: authUser, error: userErr } = await supabaseServer
      .from('auth.users')
      .select('id,email,raw_user_meta_data')
      .eq('email', email)
      .maybeSingle();
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 400 });
    if (!authUser) return NextResponse.json({ exists: false }, { status: 404 });

    type AuthMeta = { name?: string | null; country_code?: string | null; message?: string | null; boat_color?: string | null; boats_total?: number | null; referral_id?: string | null };
    const row = authUser as unknown as AuthUserRow;
    const meta = (row.raw_user_meta_data || {}) as AuthMeta;
    const name = (meta.name ? String(meta.name).trim() : null) as string | null;
    const country_code = (meta.country_code ? String(meta.country_code).trim().toUpperCase() : null) as string | null;
    const country_name = country_code ? getCountryNameFromCode(country_code) : null;
    const message = (meta.message ?? null) as string | null;
    const boat_color = (meta.boat_color ?? null) as string | null;
    const boats_total = typeof meta.boats_total === 'number' ? meta.boats_total : 0;
    const referral_code = (meta.referral_id ?? null) as string | null;

    return NextResponse.json({
      exists: true,
      me: {
        email: row.email || email,
        name,
        country_code,
        country_name,
        message,
        boat_color,
        boats_total,
        referral_code,
        ref_code_8: referral_code,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


