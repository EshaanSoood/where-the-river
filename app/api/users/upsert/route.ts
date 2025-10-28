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

    // STEP 2: Set parent and apply referral attribution (creation-only)
    let parentApplied = false;
    let inviterUserId: string | null = null;
    let attributionSource: 'payload' | 'none' = 'none';

    try {
      // Import helpers to resolve inviter by code
      const { getInviterByCode } = await import('@/server/db/referrals');

      // Validate body code and lookup inviter
      if (normalizedBodyRef) {
        const hit = await getInviterByCode(normalizedBodyRef);
        if (hit?.user_id && hit.user_id !== row.id) {
          inviterUserId = hit.user_id;
          attributionSource = 'payload';
        }
      }

      // Check if parent already set (creation-only policy)
      const { data: existingRow } = await supabaseServer
        .from('users_referrals')
        .select('referred_by_user_id')
        .eq('user_id', row.id)
        .maybeSingle();

      const hadParent = !!(existingRow as { referred_by_user_id?: unknown | null } | null)?.referred_by_user_id;

      // Write parent edge if new and valid
      if (inviterUserId && !hadParent && inviterUserId !== row.id) {
        const { error: edgeErr } = await supabaseServer
          .from('users_referrals')
          .update({ referred_by_user_id: inviterUserId, updated_at: new Date().toISOString() })
          .eq('user_id', row.id);

        if (!edgeErr) {
          parentApplied = true;
          // Mirror to auth metadata for display
          (nextMeta as { referred_by?: string }).referred_by = inviterUserId;
        } else {
          console.warn('[upsert] parent write failed', { user_id: row.id, error: edgeErr.message });
        }
      }
    } catch (e) {
      console.warn('[upsert] parent attribution failed', { user_id: row.id, error: String(e) });
    }

    // STEP 3: Award points (idempotent depth-based)
    if (parentApplied) {
      try {
        await supabaseServer.rpc('apply_users_ref_awards', { p_invitee_id: row.id });
      } catch (e) {
        console.warn('[upsert] awards RPC failed', { user_id: row.id, error: String(e) });
        // Non-blocking; continue
      }
    }

    // STEP 4: Ensure display name in metadata
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


