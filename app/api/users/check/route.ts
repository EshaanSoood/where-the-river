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

    const { data: list, error: listErr } = await supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400 });
    type AdminUser = { id: string; email: string | null; user_metadata?: Record<string, unknown> | null; raw_user_meta_data?: Record<string, unknown> | null };
    const users = (list?.users || []) as AdminUser[];
    const target = users.find((u) => (u.email || "").toLowerCase() === String(email).toLowerCase());
    if (!target) return NextResponse.json({ exists: false });

    const meta: AuthMeta = ((target.user_metadata || target.raw_user_meta_data) || {}) as AuthMeta;

    const user = {
      id: target.id as string,
      email: target.email as string,
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


