import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCountryNameFromCode } from "@/lib/countryMap";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body || {};
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    // Source of truth: Supabase Auth Admin users (metadata)
    const { data: list, error: listErr } = await supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400 });
    type AdminUser = {
      id: string;
      email: string | null;
      user_metadata?: Record<string, unknown> | null;
      raw_user_meta_data?: Record<string, unknown> | null;
    };
    const users = (list?.users || []) as AdminUser[];
    const target = users.find((u) => (u.email || "").toLowerCase() === String(email).toLowerCase());
    if (!target) return NextResponse.json({ exists: false }, { status: 404 });

    type AuthMeta = { name?: string | null; country_code?: string | null; message?: string | null; boat_color?: string | null; boats_total?: number | null; referral_id?: string | null };
    const meta = ((target.user_metadata || target.raw_user_meta_data) || {}) as AuthMeta;
    const name = (meta.name ? String(meta.name).trim() : null) as string | null;
    const country_code = (meta.country_code ? String(meta.country_code).trim().toUpperCase() : null) as string | null;
    const country_name = country_code ? getCountryNameFromCode(country_code) : null;
    const message = (meta.message ?? null) as string | null;
    const boat_color = (meta.boat_color ?? null) as string | null;
    // Prefer server-authoritative total from boats_totals view; fallback to metadata if unavailable
    let boats_total = 0;
    try {
      const { data: totalRow, error: totalErr } = await supabaseServer
        .from('boats_totals')
        .select('boats_total')
        .eq('user_id', target.id)
        .maybeSingle();
      if (!totalErr && totalRow && typeof (totalRow as { boats_total?: unknown }).boats_total === 'number') {
        boats_total = (totalRow as { boats_total: number }).boats_total;
      } else {
        boats_total = typeof meta.boats_total === 'number' ? meta.boats_total : 0;
      }
    } catch {
      boats_total = typeof meta.boats_total === 'number' ? meta.boats_total : 0;
    }
    // Prefer SoT for referral code; fall back to metadata if absent
    let referral_code = (meta.referral_id ?? null) as string | null;
    try {
      const { data: codeRow } = await supabaseServer
        .from('referral_codes')
        .select('code')
        .eq('user_id', target.id)
        .maybeSingle();
      if (codeRow && (codeRow as { code?: string | null }).code) {
        referral_code = (codeRow as { code: string }).code;
      }
    } catch {}

    // Ensure-on-read for signed-in users: if no SoT code yet, mint via RPC (idempotent) and re-read
    if (!referral_code) {
      try {
        await supabaseServer.rpc('assign_referral_code', { p_user_id: target.id });
        const { data: codeRow2 } = await supabaseServer
          .from('referral_codes')
          .select('code')
          .eq('user_id', target.id)
          .maybeSingle();
        if (codeRow2 && (codeRow2 as { code?: string | null }).code) {
          referral_code = (codeRow2 as { code: string }).code;
        }
      } catch {}
    }
    const baseUrl = ((process.env.NEXT_PUBLIC_SITE_URL as string) || (process.env.PUBLIC_APP_BASE_URL as string) || '').replace(/\/$/, '');
    const referral_url = referral_code ? `${baseUrl}/?ref=${referral_code}` : null;

    return NextResponse.json({
      exists: true,
      me: {
        email: target.email || email,
        name,
        country_code,
        country_name,
        message,
        boat_color,
        boats_total,
        referral_code,
        ref_code_8: referral_code,
        referral_url,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}


