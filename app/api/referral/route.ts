import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { inviterId } = body as { inviterId?: string };
    const baseUrl = ((process.env.NEXT_PUBLIC_SITE_URL as string) || (process.env.PUBLIC_APP_BASE_URL as string) || req.nextUrl.origin || '').replace(/\/$/, '');

    if (!inviterId) {
      return new NextResponse(JSON.stringify({ referral: null, error: "inviterId required" }), { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // Read-only: fetch existing canonical code from SoT; do not mint here
    const { data: row, error: codeErr } = await supabaseServer
      .from('referral_codes')
      .select('code')
      .eq('user_id', inviterId)
      .maybeSingle();
    if (codeErr) {
      return new NextResponse(JSON.stringify({ referral: null, error: codeErr.message }), { status: 500, headers: { "Cache-Control": "no-store" } });
    }
    const code = row ? (row as { code?: string | null }).code || null : null;
    if (!code) {
      // No code yet; client should call /api/my-referral-link to ensure-on-read
      return new NextResponse(JSON.stringify({ referral: null, pending: true }), { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    // Return canonical share URL
    return new NextResponse(JSON.stringify({ referral: `${baseUrl}/?ref=${code}` }), { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new NextResponse(JSON.stringify({ referral: null, error: message }), { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}


