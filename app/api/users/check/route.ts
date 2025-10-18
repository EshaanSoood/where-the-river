import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body || {};
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    type AuthMeta = {
      name?: string | null;
      message?: string | null;
      referral_id?: string | null;
      country_code?: string | null;
      boat_color?: string | null;
    };
    type AuthUserRow = { id: string; email: string; raw_user_meta_data: AuthMeta | null };

    const { data: authUser, error } = await supabaseServer
      .from('auth.users')
      .select('id,email,raw_user_meta_data')
      .eq('email', email)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!authUser) return NextResponse.json({ exists: false });

    const row = authUser as unknown as AuthUserRow;
    const meta: AuthMeta = (row.raw_user_meta_data || {}) as AuthMeta;

    const user = {
      id: row.id,
      email: row.email,
      name: meta.name ?? null,
      city: null as string | null,
      message: meta.message ?? null,
      referral_id: meta.referral_id ?? null,
      country_code: meta.country_code ?? null,
      boat_color: meta.boat_color ?? null,
    };
    return NextResponse.json({ exists: true, user });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


