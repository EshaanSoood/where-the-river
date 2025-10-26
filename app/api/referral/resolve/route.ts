import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// Lightweight in-memory rate limiter (per process). Acceptable for dev/staging; prod may run multiple instances.
type Bucket = { count: number; resetAt: number };
const minuteBuckets = new Map<string, Bucket>();
const dayBuckets = new Map<string, Bucket>();
function rlKeyFromReq(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const ip = (xf.split(",")[0] || req.headers.get("x-real-ip") || "0.0.0.0").trim();
  return `ip:${ip}`;
}
function hitLimit(key: string, now: number, limit: number, windowMs: number, map: Map<string, Bucket>): boolean {
  const b = map.get(key);
  if (!b || now > b.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  b.count++;
  return b.count > limit;
}

export async function GET(req: NextRequest) {
  try {
    // Rate limits: 20/min and 200/day per IP. Constant-shape responses on limit.
    try {
      const key = rlKeyFromReq(req);
      const now = Date.now();
      const overMinute = hitLimit(key+":m", now, 20, 60_000, minuteBuckets);
      const overDay = hitLimit(key+":d", now, 200, 86_400_000, dayBuckets);
      if (overMinute || overDay) {
        return new NextResponse(JSON.stringify({ first_name: null, user_id: null }), { status: 200, headers: { "Cache-Control": "no-store" } });
      }
    } catch {}

    const raw = (req.nextUrl.searchParams.get("code") || "").trim();
    if (!raw) return new NextResponse(JSON.stringify({ first_name: null, user_id: null }), { status: 200, headers: { "Cache-Control": "no-store" } });
    const norm = raw.replace(/-/g, "").toUpperCase();

    // Prefer SoT tables
    const { data: codeRow } = await supabaseServer
      .from('referral_codes')
      .select('user_id')
      .eq('code', norm)
      .maybeSingle();

    let userId: string | null = null;
    if (codeRow) {
      userId = (codeRow as { user_id?: string | null }).user_id || null;
    } else {
      const { data: aliasRow } = await supabaseServer
        .from('referral_code_aliases')
        .select('user_id')
        .eq('code', norm)
        .maybeSingle();
      userId = aliasRow ? (aliasRow as { user_id?: string | null }).user_id || null : null;
    }

    if (!userId) {
      // Constant-shape not-found
      return new NextResponse(JSON.stringify({ first_name: null, user_id: null }), { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    // Resolve first name from auth metadata (best-effort)
    const { data: authRow } = await supabaseServer
      .from('auth.users')
      .select('user_metadata, raw_user_meta_data')
      .eq('id', userId)
      .maybeSingle();
    const metaNew = (authRow ? (authRow as { user_metadata?: Record<string, unknown> | null }).user_metadata || {} : {}) as Record<string, unknown>;
    const metaRaw = (authRow ? (authRow as { raw_user_meta_data?: Record<string, unknown> | null }).raw_user_meta_data || {} : {}) as Record<string, unknown>;
    const nameCandidate = (typeof metaNew.name === 'string' && metaNew.name.trim()) ? String(metaNew.name).trim() : (typeof metaRaw.name === 'string' ? String(metaRaw.name).trim() : '');
    const fullName = nameCandidate;
    const firstName = fullName ? (fullName.split(/\s+/)[0] || '') : '';

    return new NextResponse(JSON.stringify({ first_name: firstName || null, user_id: userId }), { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new NextResponse(JSON.stringify({ first_name: null, user_id: null, error: msg }), { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}





