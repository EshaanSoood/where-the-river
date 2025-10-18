import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AuthMeta = { referral_id?: string | null } & Record<string, unknown>;

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
  if (!url || !key) {
    throw new Error("Missing Supabase env vars on server");
  }
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { inviterId } = body as { inviterId?: string };
    const token = Math.random().toString(36).slice(2, 10);

    if (!inviterId) {
      return NextResponse.json({ error: "inviterId required" }, { status: 400 });
    }

    const supabase = getServerSupabase();
    // Update inviter's metadata with a new generated token if not present
    const { data: inviter, error: invErr } = await supabase
      .from('auth.users')
      .select('id,raw_user_meta_data')
      .eq('id', inviterId)
      .maybeSingle();
    if (invErr || !inviter) throw new Error(invErr?.message || 'inviter_not_found');
    const meta = ((inviter as unknown as { raw_user_meta_data: AuthMeta | null }).raw_user_meta_data || {}) as AuthMeta;
    const referral_id = (typeof meta.referral_id === 'string' && meta.referral_id) ? meta.referral_id : token;
    const nextMeta: AuthMeta = { ...meta, referral_id };
    const { error: updErr } = await supabase.auth.admin.updateUserById(inviterId, { user_metadata: nextMeta });
    if (updErr) throw updErr;
    return NextResponse.json({ referral: `/r/${referral_id}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


