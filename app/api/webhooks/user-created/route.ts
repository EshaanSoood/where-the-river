import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const secretHeader = req.headers.get("x-webhook-secret") || "";
    const expected = process.env.SUPABASE_WEBHOOK_SECRET || "";
    if (!expected || secretHeader !== expected) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const userId = (body && typeof body.id === 'string') ? body.id : (typeof body?.user?.id === 'string' ? body.user.id : null);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "missing_user_id" }, { status: 400 });
    }
    const { error } = await supabaseServer.rpc('assign_referral_code', { p_user_id: userId });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}


