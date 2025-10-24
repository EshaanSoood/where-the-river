import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCountryNameFromCode } from "@/lib/countryMap";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = (body || {}) as { email?: string };

    // Source of truth: Supabase Auth Admin users (metadata)
    // Try Authorization Bearer first (session-based), then fall back to email lookup
    let target: { id: string; email: string | null; user_metadata?: Record<string, unknown> | null; raw_user_meta_data?: Record<string, unknown> | null } | null = null;
    const authz = req.headers.get('authorization') || req.headers.get('Authorization');
    if (authz && authz.startsWith('Bearer ')) {
      const token = authz.slice(7);
      try {
        const { data: userRes, error: userErr } = await supabaseServer.auth.getUser(token);
        if (!userErr && userRes?.user) {
          const u = userRes.user as { id: string; email: string | null; user_metadata?: Record<string, unknown> | null };
          target = { id: u.id, email: u.email, user_metadata: (u.user_metadata || null), raw_user_meta_data: (u.user_metadata || null) };
        }
      } catch {}
    }
    if (!target) {
      if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400, headers: { "Cache-Control": "no-store" } });
      const { data: list, error: listErr } = await supabaseServer.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
      type AdminUser = { id: string; email: string | null; user_metadata?: Record<string, unknown> | null; raw_user_meta_data?: Record<string, unknown> | null };
      const users = (list?.users || []) as AdminUser[];
      const found = users.find((u) => (u.email || "").toLowerCase() === String(email).toLowerCase());
      if (!found) return NextResponse.json({ exists: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
      target = found as { id: string; email: string | null; user_metadata?: Record<string, unknown> | null; raw_user_meta_data?: Record<string, unknown> | null };
    }

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
    // Build absolute base URL from env or request headers (works behind proxies)
    let baseUrl = ((process.env.NEXT_PUBLIC_SITE_URL as string) || (process.env.PUBLIC_APP_BASE_URL as string) || '').replace(/\/$/, '');
    if (!baseUrl) {
      try {
        const proto = (req.headers.get('x-forwarded-proto') || 'https').replace(/\s/g, '');
        const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').replace(/\s/g, '');
        if (host) baseUrl = `${proto}://${host}`;
      } catch {}
    }
    const referral_url = referral_code && baseUrl ? `${baseUrl}/?ref=${referral_code}` : (referral_code ? `/?ref=${referral_code}` : null);

    // Best-effort mirror: if we have a canonical code, mirror to auth.users metadata for dashboard convenience
    try {
      if (referral_code) {
        await supabaseServer.auth.admin.updateUserById(target.id, { user_metadata: { ...(meta as Record<string, unknown>), referral_id: referral_code } });
      }
    } catch {}

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
        referral_id: referral_code,
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


