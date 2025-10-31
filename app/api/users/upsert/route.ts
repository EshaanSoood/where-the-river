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

    // Extract and normalize referral code from payload (body-first attribution)
    const bodyRefRaw = (referred_by ?? null) as string | null;
    const bodyRefRawStr = typeof bodyRefRaw === 'string' ? bodyRefRaw.trim() : '';
    const bodyRefDigits = /^\d{6,12}$/.test(bodyRefRawStr) ? bodyRefRawStr : '';
    const normalizedBodyRef = bodyRefDigits.length > 0 ? bodyRefDigits : null;

    // Email normalization
    const emailLower = String(email || "").trim().toLowerCase();
    const sanitized = { name: cleanedName, email: emailLower, country_code: cc, message: message ?? null, photo_url: photo_url ?? null, boat_color: boat_color ?? null, referred_by: normalizedBodyRef };

    // Lookup auth user by email using Admin API (not PostgREST, since auth.users is not exposed)
    type AuthMeta = Record<string, unknown>;
    type AuthUserRow = { id: string; email: string; user_metadata: AuthMeta | null; raw_user_meta_data: AuthMeta | null };
    
    let authUser: AuthUserRow | null = null;
    try {
      const { data: { users }, error: adminErr } = await supabaseServer.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (adminErr) throw adminErr;
      // Find user by email (listUsers doesn't support filters, so search in memory)
      authUser = (users && users.length > 0) 
        ? (users.find(u => u.email === emailLower) as AuthUserRow | undefined) || null 
        : null;
    } catch (e) {
      console.warn('[upsert] auth lookup failed', { email: emailLower, error: String(e) });
      return NextResponse.json({ error: 'auth_lookup_failed' }, { status: 400 });
    }

    // If user exists, get their stored metadata (which may have referred_by from OTP signup)
    const existingMeta = (authUser as AuthUserRow | null)?.raw_user_meta_data || {};
    const storedReferredBy = (existingMeta as Record<string, unknown>).referred_by as string | null | undefined;

    // Merge: prefer body-provided referred_by, fallback to stored referred_by
    const finalReferredBy = normalizedBodyRef || (
      typeof storedReferredBy === 'string' ? storedReferredBy.trim() : null
    );
    const finalNormalizedRef = /^\d{6,12}$/.test(finalReferredBy || '') ? finalReferredBy : null;

    const row = authUser as unknown as AuthUserRow;
    const prevMeta: AuthMeta = (row.raw_user_meta_data || {}) as AuthMeta;

    // Prepare next metadata (includes new profile data)
    const nextMeta: AuthMeta = {
      ...prevMeta,
      name: sanitized.name,
      full_name: sanitized.name,
      country_code: sanitized.country_code,
      message: sanitized.message,
      boat_color: sanitized.boat_color,
      otp_verified: true,
    };

    // STEP 1: Ensure user has referral code in unified table
    let canonicalCode: string | null = null;
    try {
      const { data: codeData } = await supabaseServer.rpc('assign_users_referrals_row', { p_user_id: row.id });
      canonicalCode = (codeData as unknown as string) || null;
    } catch (e) {
      console.warn('[upsert] assign_users_referrals_row failed', { user_id: row.id, error: String(e) });
    }

    // STEP 1b: Ensure referred_by is in metadata if we have it (so finalize RPC can read it)
    if (finalNormalizedRef && !storedReferredBy) {
      try {
        await supabaseServer.auth.admin.updateUserById(row.id, {
          user_metadata: { ...(row.raw_user_meta_data || {}), referred_by: finalNormalizedRef }
        });
        console.log('[upsert] stored referred_by in metadata', { user_id: row.id, code: finalNormalizedRef });
      } catch (e) {
        console.warn('[upsert] failed to store referred_by in metadata', { user_id: row.id, error: String(e) });
      }
    }

    // STEP 2: Set parent and apply referral attribution (creation-only)
    let parentApplied = false;
    let inviterUserId: string | null = null;
    let attributionSource: 'payload' | 'none' = 'none';

    try {
      // Call Supabase RPC to handle referral attribution entirely within the database
      // This RPC: looks up the code from metadata → resolves to inviter → sets parent → awards points
      const { data: attrResult, error: attrErr } = await supabaseServer.rpc(
        'finalize_users_referral_attribution',
        { p_user_id: row.id }
      );
      
      console.log('[upsert] referral attribution result', {
        user_id: row.id,
        success: (attrResult as Record<string, unknown>)?.success,
        reason: (attrResult as Record<string, unknown>)?.reason,
        inviter_id: (attrResult as Record<string, unknown>)?.inviter_id,
        code: (attrResult as Record<string, unknown>)?.code,
        error: attrErr?.message
      });

      if (attrResult && (attrResult as Record<string, unknown>).success) {
        parentApplied = true;
        inviterUserId = (attrResult as Record<string, unknown>).inviter_id as string | null;
        attributionSource = 'payload';
      }
    } catch (e) {
      console.warn('[upsert] referral attribution RPC failed', { user_id: row.id, error: String(e) });
      // Non-blocking; continue
    }

    // STEP 3: Ensure display name in metadata
    try {
      const metaPrev = prevMeta as Record<string, unknown>;
      const fromBody = sanitized.name as string;
      const fromAuthFull = (typeof metaPrev.full_name === 'string' ? metaPrev.full_name as string : '') || '';
      const fromAuthName = (typeof metaPrev.name === 'string' ? metaPrev.name as string : '') || '';
      const emailLocal = String(sanitized.email || '').split('@')[0] || '';
      const titleCaseLocal = emailLocal.replace(/\+.*/, '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
      const candidate = [fromBody, fromAuthFull, fromAuthName, titleCaseLocal]
        .map(s => (String(s || '').trim()))
        .find(s => s.length > 0) || '';
      if (candidate && !((nextMeta as Record<string, unknown>).full_name)) {
        (nextMeta as Record<string, unknown>).full_name = candidate;
        await ensureDisplayName(row.id, candidate);
      }
    } catch (e) {
      console.warn('[upsert] display name ensure failed', { user_id: row.id, error: String(e) });
    }

    // STEP 5: Update auth user metadata
    const { error: updErr } = await supabaseServer.auth.admin.updateUserById(
      row.id,
      { user_metadata: { ...nextMeta, ...(canonicalCode ? { referral_id: canonicalCode } : {}) } }
    );
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    // STEP 6: Mark OTP verified (monotonic)
    try { await supabaseServer.rpc('mark_otp_verified', { p_user_id: row.id }); } catch {}

    // Prepare response
    const res = NextResponse.json(
      {
        user: {
          email: row.email,
          name: sanitized.name,
          country_code: sanitized.country_code,
          message: sanitized.message,
          referral_id: canonicalCode,
          boat_color: sanitized.boat_color
        }
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );

    return res;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error('[upsert] unhandled error', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


