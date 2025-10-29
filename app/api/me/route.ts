import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCountryNameFromCode } from "@/lib/countryMap";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getDisplayNameByUserId } from "@/server/names/nameService";

export const dynamic = 'force-dynamic';

async function handleProfile(req: Request) {
  try {
    // Identify user from server session (cookies) first, then Authorization header as fallback
    let target: { id: string; email: string | null; user_metadata?: Record<string, unknown> | null; raw_user_meta_data?: Record<string, unknown> | null } | null = null;
    try {
      const supabase = createRouteHandlerClient({ cookies });
      const { data: { user }, error: uerr } = await supabase.auth.getUser();
      if (!uerr && user) {
        const u = user as { id: string; email: string | null; user_metadata?: Record<string, unknown> | null };
        target = { id: u.id, email: u.email, user_metadata: (u.user_metadata || null), raw_user_meta_data: (u.user_metadata || null) };
      }
    } catch {}

    if (!target) {
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
    }
    if (!target) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

    type AuthMeta = { name?: string | null; country_code?: string | null; message?: string | null; boat_color?: string | null; boats_total?: number | null; referral_id?: string | null };
    const meta = ((target.user_metadata || target.raw_user_meta_data) || {}) as AuthMeta;
    const country_code = (meta.country_code ? String(meta.country_code).trim().toUpperCase() : null) as string | null;
    const country_name = country_code ? getCountryNameFromCode(country_code) : null;
    const message = (meta.message ?? null) as string | null;
    const boat_color = (meta.boat_color ?? null) as string | null;
    // Prefer server-authoritative total from users_referrals; fallback to metadata if unavailable
    let boats_total = 0;
    try {
      const { data: totalRow, error: totalErr } = await supabaseServer
        .from('users_referrals')
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
    // Prefer SoT for referral code via centralized helper; fall back to metadata if absent
    let referral_code = (meta.referral_id ?? null) as string | null;
    try {
      const { ensureUserHasReferralCode } = await import('@/server/db/referrals');
      const { code: existing } = await ensureUserHasReferralCode(target.id);
      if (existing) referral_code = existing;
    } catch {}

    // Ensure-on-read for signed-in users: if no SoT code yet, mint via RPC (idempotent) and re-read
    if (!referral_code) {
      try {
        const { ensureUserHasReferralCode } = await import('@/server/db/referrals');
        const { code: minted } = await ensureUserHasReferralCode(target.id);
        if (minted) referral_code = minted;
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

    // Profiles-first display name via nameService
    const nameRes = await getDisplayNameByUserId(target.id);
    const name = nameRes.fullName || nameRes.firstName || null;

    return NextResponse.json({
      exists: true,
      me: {
        id: target.id,
        email: target.email,
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

export async function GET(req: Request) {
  return handleProfile(req);
}

export async function POST(req: Request) {
  // Keep POST compatibility; user identification via session (cookies) or Authorization header only
  // Body parameters (like email) are ignored; session/auth header is the source of truth
  return handleProfile(req);
}


