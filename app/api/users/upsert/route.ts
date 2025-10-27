import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
// Ref attribution is now body-first and creation-only; cookies are not used for attribution here
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

    // 02 — upsert sanitized input (Phase 3: keep response shape, but move attribution to atomic path)
    const bodyRefRaw = (referred_by ?? null) as string | null;
    const bodyRef = (typeof bodyRefRaw === 'string' ? bodyRefRaw.replace(/\D+/g, '') : '').trim();
    const normalizedBodyRef = bodyRef.length > 0 ? bodyRef : null;
    const sanitized = { name: cleanedName, email: String(email), country_code: cc, message: message ?? null, photo_url: photo_url ?? null, boat_color: boat_color ?? null, referred_by: normalizedBodyRef };
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

    // Ensure referral code via SoT (idempotent) — safe if already exists
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

    // Phase 3 — Atomic attribution and depth-aware awards (no response shape change)
    try {
      const cookieHeader = req.headers.get('cookie') || '';
      const m = cookieHeader.match(/(?:^|; )river_ref_h=([^;]+)/);
      const cookieCodeRaw = m ? decodeURIComponent(m[1]) : '';
      const cookieDigits = cookieCodeRaw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[^0-9]/g, '');
      const cookieCode = cookieDigits.length ? cookieDigits : null;

      const { USE_REFERRAL_HELPERS } = await import('@/server/config/flags');
      let inviterUserId: string | null = null;
      let chosenSource: 'cookie'|'body'|'none' = 'none';
      if (USE_REFERRAL_HELPERS) {
        const { getInviterByCode, getAncestorChain } = await import('@/server/db/referrals');
        // Validate cookie first
        if (cookieCode) {
          const hit = await getInviterByCode(cookieCode);
          if (hit?.user_id && hit.user_id !== row.id) { inviterUserId = hit.user_id; chosenSource = 'cookie'; }
        }
        // Fallback to body code
        if (!inviterUserId && normalizedBodyRef) {
          const hit2 = await getInviterByCode(normalizedBodyRef);
          if (hit2?.user_id && hit2.user_id !== row.id) { inviterUserId = hit2.user_id; chosenSource = 'body'; }
        }

        // Atomic DB-side application (ensures code, sets parent if null, writes ledger idempotently)
        const { REFERRALS_DISABLE_AWARDS } = await import('@/server/config/flags');
        // Kill switch propagated via PostgreSQL GUC if needed
        try { await supabaseServer.rpc('set_config', { p_name: 'app.referrals_disable_awards', p_value: String(REFERRALS_DISABLE_AWARDS), p_is_local: true } as unknown as Record<string, unknown>); } catch {}
        const { data: applyRes } = await supabaseServer.rpc('apply_referral_and_awards', {
          p_invitee_id: row.id,
          p_inviter_id: inviterUserId,
        });
        const applied = Boolean((applyRes as { applied?: boolean } | null)?.applied);

        // Optional totals refresh (view usually reflects immediately); include ancestors + invitee
        if (inviterUserId) {
          try {
            const { refreshBoatsTotals } = await import('@/server/boats/totals');
            const ancestors = await getAncestorChain(row.id, 3);
            const beneficiaryIds = Array.from(new Set<string>([inviterUserId, ...ancestors.map(a => a.user_id)]));
            await refreshBoatsTotals(beneficiaryIds);
          } catch {}
        }

        // Clear cookie on success (regardless of chosen source) to avoid stale attribution
        if (applied) {
          // Cookie cleared in response below
          (nextMeta as Record<string, unknown>).__clear_ref_cookie = true;
        }

        // Debug log (guarded)
        if (process.env.DEBUG_REFERRALS) {
          console.info('[upsert:p3]', {
            cookie_present: !!cookieCode,
            body_present: !!normalizedBodyRef,
            chosen_source: chosenSource,
            inviter_found: !!inviterUserId,
            applied,
            skipped_reason: (!inviterUserId && (cookieCode || normalizedBodyRef)) ? 'invalid_or_self_ref' : null,
            invitee_id: row.id,
          });
        }
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

    // 04 — mark OTP verified (monotonic true); awards handled atomically above
    try { await supabaseServer.rpc('mark_otp_verified', { p_user_id: row.id }); } catch {}

    const res = NextResponse.json({ user: { email: row.email, name: sanitized.name, country_code: sanitized.country_code, message: sanitized.message, referral_id: (nextMeta as { referral_id?: string | null }).referral_id ?? null, boat_color: sanitized.boat_color } }, { headers: { 'Cache-Control': 'no-store' } });
    // Clear cookie if requested by atomic path
    try {
      if ((nextMeta as Record<string, unknown>).__clear_ref_cookie) {
        const isHttps = true; // server routes typically on https in prod; cookie flags must mirror middleware
        res.cookies.set('river_ref_h', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0, secure: isHttps });
      }
    } catch {}
    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


