import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const authz = req.headers.get("authorization") || "";
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      return new NextResponse(JSON.stringify({ referral_url: null, referral_code: null, otp_verified: false }), { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const token = m[1];
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
    if (!url || !anon) {
      return new NextResponse(JSON.stringify({ referral_url: null, referral_code: null, otp_verified: false }), { status: 500, headers: { "Cache-Control": "no-store" } });
    }
    const supabaseAnon = createClient(url, anon);
    const { data: userRes, error: userErr } = await supabaseAnon.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return new NextResponse(JSON.stringify({ referral_url: null, referral_code: null, otp_verified: false }), { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const userId = userRes.user.id;

    const { data: codeData, error: codeErr } = await supabaseServer.rpc("assign_referral_code", { p_user_id: userId });
    if (codeErr) throw codeErr;
    const code = (codeData as unknown as string) || null;

    const { data: verRow } = await supabaseServer
      .from("user_verifications")
      .select("otp_verified")
      .eq("user_id", userId)
      .maybeSingle();

    const otpVerified = !!(verRow && (verRow as { otp_verified?: boolean }).otp_verified);

    const baseUrl = ((process.env.NEXT_PUBLIC_SITE_URL as string) || (process.env.PUBLIC_APP_BASE_URL as string) || req.nextUrl.origin || "").replace(/\/$/, "");
    const referralUrl = code ? `${baseUrl}/?ref=${code}` : null;

    // Best-effort mirror: write canonical code into auth.users metadata for dashboard convenience
    try {
      if (code) {
        await supabaseServer.auth.admin.updateUserById(userId, { user_metadata: { referral_id: code } });
      }
    } catch {}

    return new NextResponse(JSON.stringify({ referral_url: referralUrl, referral_code: code, otp_verified: otpVerified }), {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new NextResponse(JSON.stringify({ referral_url: null, referral_code: null, otp_verified: false, error: msg }), { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}


