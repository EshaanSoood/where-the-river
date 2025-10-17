import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type UserMeta = {
  first_name?: string;
  last_name?: string;
  name?: string;
};
type AuthUserRow = { id: string; user_metadata?: UserMeta };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body || {};
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    const { data: authUser, error } = await supabaseServer
      .from('auth.users')
      .select('id,email,user_metadata')
      .eq('email', email)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!authUser) return NextResponse.json({ exists: false }, { status: 404 });
    const um = ((authUser as unknown as AuthUserRow).user_metadata || {}) as UserMeta;
    let name = [um.first_name, um.last_name].filter(Boolean).join(" ").trim() || (um.name || "").trim();
    let ref_code_8: string | null = null;
    try {
      // Match app users by email (users table stores email on upsert)
      const { data: userRow } = await supabaseServer
        .from("users")
        .select("referral_id,name")
        .eq("email", email)
        .maybeSingle();
      ref_code_8 = userRow?.referral_id ?? null;
      if (!name && userRow?.name) name = String(userRow.name).trim();
    } catch {}
    return NextResponse.json({ exists: true, profile: { id: (authUser as unknown as AuthUserRow).id, name, ref_code_8 } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


