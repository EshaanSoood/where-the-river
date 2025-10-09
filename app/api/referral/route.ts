import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const { data: user, error } = await supabase
      .from("users")
      .insert({ referral_id: token, referred_by: inviterId })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ referral: `/r/${user.referral_id}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


