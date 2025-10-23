import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveIso2, isIso2, toIso2Upper, normalizeInput } from "@/lib/countryMap";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, country_code, message, photo_url, referred_by, boat_color } = body || {} as Record<string, unknown>;
    if (!email || !country_code) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    // Diagnostics: prepare run folder when header present
    const hdr = req.headers.get("x-diag-run-id");
    const now = new Date();
    const runId = hdr || `run-${now.toISOString().slice(0,16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4}).*/, "$1-$2")}`;
    const diagBase = path.join(process.cwd(), "docs", "_diagnostics", runId);
    const writeDiag = async (file: string, lines: string[]) => {
      try {
        await fs.mkdir(diagBase, { recursive: true });
        await fs.writeFile(path.join(diagBase, file), lines.join("\n"), "utf8");
      } catch {}
    };
    // 01 — signup payload (as received)
    await writeDiag("01-signup-payload.txt", [
      "Payload included name,email,country_code,boat_color → " + ((name && email && country_code && boat_color) ? "PASS" : "FAIL"),
      JSON.stringify({ name, email, country_code, boat_color, message, photo_url, referred_by }, null, 2)
    ]);

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
    const sanitized = { name: cleanedName, email: String(email), country_code: cc, message: message ?? null, photo_url: photo_url ?? null, referred_by: referred_by ?? null, boat_color: boat_color ?? null };
    await writeDiag("02-upsert-input.txt", [
      "Sanitized contains expected fields → " + ((sanitized.name && sanitized.email && sanitized.country_code) ? "PASS" : "FAIL"),
      JSON.stringify(sanitized, null, 2)
    ]);

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

    // Ensure referral code via SoT (idempotent). Do not mint in this route.
    try {
      await supabaseServer.rpc('assign_referral_code', { p_user_id: (authUser as { id: string }).id });
    } catch {}

    const row = authUser as unknown as AuthUserRow;
    const prevMeta: AuthMeta = (row.raw_user_meta_data || {}) as AuthMeta;
    const nextMeta: AuthMeta = {
      ...prevMeta,
      name: sanitized.name,
      country_code: sanitized.country_code,
      message: sanitized.message,
      boat_color: sanitized.boat_color,
      // Only set referred_by if not already present (first click wins, no overwrite)
      referred_by: (prevMeta as { referred_by?: unknown }).referred_by ?? sanitized.referred_by,
      otp_verified: true,
    };

    // Update auth user metadata via admin API
    const { error: updErr } = await supabaseServer.auth.admin.updateUserById(
      row.id,
      { user_metadata: nextMeta }
    );
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    // 03 — db probe (updated auth user metadata)
    await writeDiag("03-db-probe.txt", [
      "Updated auth.users user_metadata contains expected fields → " + ((nextMeta as { name?: unknown; country_code?: unknown }).name && (nextMeta as { name?: unknown; country_code?: unknown }).country_code ? "PASS" : "FAIL"),
      JSON.stringify({ id: row.id, user_metadata: nextMeta }, null, 2)
    ]);

    // 04 — mark OTP verified (monotonic true) and minimal credit logic (first verify only)
    try {
      try {
        await supabaseServer.rpc('mark_otp_verified', { p_user_id: row.id });
      } catch {}
      const wasVerified = !!(prevMeta as { otp_verified?: unknown }).otp_verified;
      if (!wasVerified) {
        const { error: rpcErr } = await supabaseServer.rpc('award_referral_signup', { p_invitee_id: row.id });
        await writeDiag("04-credit-logic.txt", [
          `rpc_award_referral_signup_error=${rpcErr ? rpcErr.message : ''}`
        ]);
      }
    } catch {
      // Non-blocking: credit logic should not break signup
    }

    return NextResponse.json({ user: { email: row.email, name: sanitized.name, country_code: sanitized.country_code, message: sanitized.message, referral_id: (nextMeta as { referral_id?: string | null }).referral_id ?? null, boat_color: sanitized.boat_color } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


