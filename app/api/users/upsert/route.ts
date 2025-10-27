import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { readReferralFromHttpOnlyCookie, normalizeReferralCode } from '@/server/referral/refCookies';
import { chooseReferral } from '@/server/referral/attrSource';
import { ensureDisplayName } from "@/server/names/writeDisplayName";
import { resolveIso2, isIso2, toIso2Upper, normalizeInput } from "@/lib/countryMap";

export async function POST(req: Request) {
  try {
    // Gather referral inputs early
    let parsedBody: Record<string, unknown> = {};
    try { parsedBody = await req.json(); } catch { parsedBody = {}; }
    const { name, email, country_code, message, photo_url, referred_by, boat_color } = parsedBody || {} as Record<string, unknown>;
    if (!email || !country_code) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    // Diagnostics removed (previous hotfix)

    // Name validation: trim, collapse spaces, length 2..80, must contain a letter or digit
    const cleanedName = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const hasAlnum = /[\p{L}\p{N}]/u.test(cleanedName);
    if (!cleanedName || cleanedName.length < 2 || !hasAlnum) {
      console.warn('[upsert] invalid_name', { email });
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }

    // Normalize and validate country_code
    let cc: string | null = null;
    const raw = normalizeInput(String(country_code));
    if (isIso2(raw)) {
      cc = toIso2Upper(raw);
    } else {
      cc = resolveIso2(raw);
    }
    if (!cc || !/^[A-Z]{2}$/.test(cc)) {
      return NextResponse.json({ error: "invalid_country" }, { status: 400 });
    }

    // 02 — upsert sanitized input
    const sanitized = { name: cleanedName, email: String(email), country_code: cc, message: message ?? null, photo_url: photo_url ?? null, boat_color: boat_color ?? null, referred_by: referred_by ?? null };
    // Diagnostics removed

    // Lookup auth user by email
    type AuthMeta = Record<string, unknown>;
    type AuthUserRow = { id: string; email: string; user_metadata: AuthMeta | null; raw_user_meta_data: AuthMeta | null };
    const { data: authUser, error: authErr } = await supabaseServer
      .from('auth.users')
      .select('id,email,user_metadata,raw_user_meta_data')
      .eq('email', sanitized.email)
      .maybeSingle();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    if (!authUser) return NextResponse.json({ error: 'auth_user_not_found' }, { status: 404 });

    // Ensure referral code via SoT (idempotent)
    let canonicalCode: string | null = null;
    try {
      const { data: codeData } = await supabaseServer.rpc('assign_referral_code', { p_user_id: (authUser as { id: string }).id });
      canonicalCode = (codeData as unknown as string) || null;
    } catch {}

    const row = authUser as unknown as AuthUserRow;
    const prevMeta: AuthMeta = (row.raw_user_meta_data || {}) as AuthMeta;
    const nextMeta: AuthMeta = {
      ...prevMeta,
      name: sanitized.name,
      country_code: sanitized.country_code,
      message: sanitized.message,
      boat_color: sanitized.boat_color,
      otp_verified: true,
    };

    // Server-side attribution with precedence: cookie.ref > url.ref > body.referred_by; first-click wins
    try {
      const cookieRef = await readReferralFromHttpOnlyCookie();
      let urlRef: string | null = null;
      try {
        const u = new URL(req.url);
        urlRef = normalizeReferralCode(u.searchParams.get('ref'));
      } catch {}
      const bodyRef = normalizeReferralCode(sanitized.referred_by as string | null);

      const { code: incomingRef, source: applied_source } = chooseReferral({ cookieCode: cookieRef, urlCode: urlRef, bodyCode: bodyRef });
      const hadRef = !!(prevMeta as { referred_by?: unknown }).referred_by && String((prevMeta as { referred_by?: unknown }).referred_by || '').trim().length > 0;
      const alreadySet = !!(nextMeta as { referred_by?: unknown }).referred_by && String((nextMeta as { referred_by?: unknown }).referred_by || '').trim().length > 0;
      if (!hadRef && !alreadySet && incomingRef) {
        (nextMeta as { referred_by?: string | null }).referred_by = incomingRef;
      }
      
      // Minimal sampled telemetry (no PII). Enable with REF_CAPTURE_LOG_SAMPLE=1. Logs ~1% of requests.
      // Structured logs kept
      if (process.env.NODE_ENV !== "production") {
        console.log("[REFTRACE-SERVER] chosen referred_by =", incomingRef);
      }
    } catch {}

    // Server-side non-invasive auto-fill for display name in auth metadata (profilesless)
    try {
      // Derive candidate from sources in order (metadata-first, then email local-part)
      const metaNew = nextMeta as Record<string, unknown>;
      const metaPrev = prevMeta as Record<string, unknown>;
      const fromBody = sanitized.name as string;
      const fromAuthFull = (typeof metaPrev.full_name === 'string' ? metaPrev.full_name as string : '') || '';
      const fromAuthName = (typeof metaPrev.name === 'string' ? metaPrev.name as string : '') || '';
      const emailLocal = String(sanitized.email || '').split('@')[0] || '';
      const titleCaseLocal = emailLocal.replace(/\+.*/, '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
      const candidate = [fromBody, fromAuthFull, fromAuthName, titleCaseLocal]
        .map(s => (String(s || '').trim()))
        .find(s => s.length > 0) || '';
      if (candidate) {
        await ensureDisplayName(row.id, candidate);
        if (!(typeof metaPrev.full_name === 'string' && metaPrev.full_name.trim().length > 0)) {
          (nextMeta as Record<string, unknown>).full_name = candidate;
        }
      }
    } catch {}

    // Update auth user metadata via admin API (mirror canonical referral_id for dashboard convenience)
    const { error: updErr } = await supabaseServer.auth.admin.updateUserById(
      row.id,
      { user_metadata: { ...nextMeta, ...(canonicalCode ? { referral_id: canonicalCode } : {}) } }
    );
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    // 03 — db probe removed

    // 04 — mark OTP verified (monotonic true) then award points (idempotent)
    try {
      // Mark OTP verified (idempotent)
      try { await supabaseServer.rpc('mark_otp_verified', { p_user_id: row.id }); } catch {}
      // Gate award off authoritative user_metadata we just wrote
      const refVal = String((nextMeta as { referred_by?: unknown }).referred_by || '').trim();
      if (refVal.length > 0) {
        await supabaseServer.rpc('award_referral_signup', { p_invitee_id: row.id });
      }
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ user: { email: row.email, name: sanitized.name, country_code: sanitized.country_code, message: sanitized.message, referral_id: (nextMeta as { referral_id?: string | null }).referral_id ?? null, boat_color: sanitized.boat_color } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


