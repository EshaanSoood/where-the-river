import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
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
      .select('raw_user_meta_data')
      .eq('id', userId)
      .maybeSingle();
    const meta = (authRow ? (authRow as { raw_user_meta_data?: Record<string, unknown> | null }).raw_user_meta_data || {} : {}) as Record<string, unknown>;
    const fullName = typeof meta.name === 'string' ? meta.name.trim() : '';
    const firstName = fullName ? (fullName.split(/\s+/)[0] || '') : '';

    return new NextResponse(JSON.stringify({ first_name: firstName || null, user_id: userId }), { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new NextResponse(JSON.stringify({ first_name: null, user_id: null, error: msg }), { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}





